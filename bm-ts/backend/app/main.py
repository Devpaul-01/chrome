import logging
import os
from datetime import datetime, timezone

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from fastapi import APIRouter, Depends, FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers import (
    auth,
    templates,
    subscription,
    webhook,
    messages,
    dashboard,
    websocket,
    contacts,
    message_groups,
    message_templates,
    posts,
    images,
    birthday_configs,
    rate_limits,
    smtp,
    payments,
)
from app.core.config import settings
from app.services.payment_production_validation import validate_payment_production_config
from app.core.app_logging import setup_logging
from app.core.audit_log import AuditLogMiddleware
from app.core.rate_limiter import init_rate_limiter, limiter
from app.core.request_logging import RequestLoggingMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.api.deps import require_active_entitlement
from app.core.errors import AppError, ErrorCodes
from app.db.session import get_db
from app.db.models import WorkerHeartbeat

setup_logging()

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

openapi_tags = [
    {
        "name": "auth",
        "description": "Authentication, registration, password management, and session control",
    },
    {
        "name": "templates",
        "description": "CRUD for template segments (greeting / body / closing)",
    },
    {"name": "messages", "description": "Message queue and delivery history"},
    {"name": "dashboard", "description": "Dashboard statistics and analytics"},
    {
        "name": "contacts",
        "description": "Contact (friend) management — auto-populated via scraping",
    },
    {"name": "message-groups", "description": "Named groups of message templates"},
    {
        "name": "message-templates",
        "description": "Individual message templates within groups",
    },
    {"name": "posts", "description": "Timeline post templates with image overlays"},
    {"name": "images", "description": "User image library (upload and manage)"},
    {
        "name": "birthday-configs",
        "description": "Birthday mode configurations (advance / normal / followup)",
    },
    {"name": "smtp", "description": "User SMTP configuration for email delivery"},
    {
        "name": "subscription",
        "description": "Stripe subscription management and billing",
    },
    {"name": "stripe", "description": "Stripe webhook handling"},
    {
        "name": "payments",
        "description": "Provider-neutral payment flows including BTCPay invoice creation",
    },
]

# Fail closed before serving traffic when explicitly running in production.
validate_payment_production_config(settings)

app = FastAPI(
    title="BirthdayMessaging API",
    version="0.1.0",
    description="Backend API for the BirthdayMessaging Chrome Extension",
    openapi_tags=openapi_tags,
)

init_rate_limiter(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Idempotency-Key"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditLogMiddleware)
app.add_middleware(RequestLoggingMiddleware)

logger = logging.getLogger(__name__)


def _cors_headers(request: Request) -> dict[str, str]:
    """Return CORS headers for the request origin if it is allowed."""
    origin = request.headers.get("origin", "")
    if origin in settings.cors_origins:
        return {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
        }
    return {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Status-code → default error code mapping used by the HTTPException handler.
_HTTP_STATUS_TO_CODE: dict[int, str] = {
    400: ErrorCodes.BAD_REQUEST,
    401: ErrorCodes.UNAUTHORIZED,
    403: ErrorCodes.FORBIDDEN,
    404: ErrorCodes.NOT_FOUND,
    409: ErrorCodes.CONFLICT,
    413: ErrorCodes.FILE_TOO_LARGE,
    415: ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
    422: ErrorCodes.VALIDATION_ERROR,
    429: ErrorCodes.RATE_LIMIT_EXCEEDED,
    500: ErrorCodes.INTERNAL_SERVER_ERROR,
    501: ErrorCodes.NOT_IMPLEMENTED,
}


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Convert AppError into a structured JSON error response."""
    content: dict = {
        "detail": exc.detail,
        "code": exc.code,
        "timestamp": _now_iso(),
        "errors": ([e.model_dump() for e in exc.errors] if exc.errors else None),
    }
    headers = dict(exc.headers) if exc.headers else {}
    headers.update(_cors_headers(request))
    return JSONResponse(
        status_code=exc.status_code, content=content, headers=headers or None
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Unify Pydantic 422 errors into the standard error shape."""
    field_errors = []
    for error in exc.errors():
        loc = error.get("loc", ())
        # Skip the first element ("body", "query", etc.) — use only the field name(s)
        field_parts = (
            [str(p) for p in loc[1:]]
            if len(loc) > 1
            else [str(loc[0])]
            if loc
            else ["__root__"]
        )
        field_errors.append(
            {"field": ".".join(field_parts), "message": error.get("msg", "")}
        )

    content = {
        "detail": "Validation error",
        "code": ErrorCodes.VALIDATION_ERROR,
        "timestamp": _now_iso(),
        "errors": field_errors,
    }
    return JSONResponse(
        status_code=422,
        content=content,
        headers=_cors_headers(request) or None,
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Normalize framework-raised HTTPExceptions (slowapi, OAuth2, etc.)."""
    code = _HTTP_STATUS_TO_CODE.get(exc.status_code, ErrorCodes.BAD_REQUEST)
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    content = {
        "detail": detail,
        "code": code,
        "timestamp": _now_iso(),
        "errors": None,
    }
    headers: dict[str, str] = {}
    if hasattr(exc, "headers") and exc.headers:
        headers.update(exc.headers)
    headers.update(_cors_headers(request))
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers=headers or None,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all so that 500 responses still carry CORS headers and structured shape."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    content = {
        "detail": "Internal server error",
        "code": ErrorCodes.INTERNAL_SERVER_ERROR,
        "timestamp": _now_iso(),
        "errors": None,
    }
    return JSONResponse(
        status_code=500,
        content=content,
        headers=_cors_headers(request) or None,
    )


# ---------------------------------------------------------------------------
# Router authorization boundaries
# ---------------------------------------------------------------------------
#
# Keep account recovery, authentication, billing, payment-provider callbacks,
# and service health outside the paid feature boundary.  Application features
# are mounted under one parent router with a provider-neutral entitlement
# dependency.  This makes authorization fail-closed at the router boundary: a
# new endpoint added to any paid child router automatically inherits the check.
#
# FastAPI documents APIRouter-level dependencies as applying to every path
# operation in that router (including included child routers).  We therefore do
# not need to duplicate Depends(require_active_entitlement) on every endpoint.

PAID_HTTP_ROUTER_SPECS = (
    ("app.api.routers.smtp", smtp.router, {}),
    (
        "app.api.routers.templates",
        templates.router,
        {"prefix": "/templates", "tags": ["templates"]},
    ),
    ("app.api.routers.messages", messages.router, {"prefix": "/api"}),
    ("app.api.routers.dashboard", dashboard.router, {"prefix": "/api"}),
    (
        "app.api.routers.contacts",
        contacts.router,
        {"prefix": "/api", "tags": ["contacts"]},
    ),
    (
        "app.api.routers.message_groups",
        message_groups.router,
        {"prefix": "/api", "tags": ["message-groups"]},
    ),
    (
        "app.api.routers.message_templates",
        message_templates.router,
        {"prefix": "/api", "tags": ["message-templates"]},
    ),
    (
        "app.api.routers.posts",
        posts.router,
        {"prefix": "/api", "tags": ["posts"]},
    ),
    (
        "app.api.routers.images",
        images.router,
        {"prefix": "/api", "tags": ["images"]},
    ),
    (
        "app.api.routers.birthday_configs",
        birthday_configs.router,
        {"prefix": "/api", "tags": ["birthday-configs"]},
    ),
    (
        "app.api.routers.rate_limits",
        rate_limits.router,
        {"prefix": "/api", "tags": ["rate-limits"]},
    ),
)

PAID_HTTP_ROUTER_MODULES = frozenset(
    module_name for module_name, _router, _options in PAID_HTTP_ROUTER_SPECS
)

paid_features_router = APIRouter(
    dependencies=[Depends(require_active_entitlement)]
)

# Paid application feature routers. Every router in this registry is mounted
# through the same authorization boundary; there is no per-endpoint opt-in.
for _module_name, _router, _include_options in PAID_HTTP_ROUTER_SPECS:
    paid_features_router.include_router(_router, **_include_options)

# Unpaid control-plane routers must remain reachable so users can authenticate,
# recover an account, purchase/renew access, and receive provider callbacks.
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(subscription.router, prefix="/subscription", tags=["subscription"])
app.include_router(webhook.router, prefix="/stripe", tags=["stripe"])
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])

# WebSocket authorization is intentionally handled separately because its
# authentication handshake/token flow is not the same as HTTP OAuth2Bearer.
app.include_router(websocket.router)


@app.get("/livez", summary="Process liveness")
async def liveness_check() -> dict[str, str]:
    """Report whether the API process itself is alive."""
    return {"status": "ok"}


@app.get("/readyz", summary="Service readiness")
async def readiness_check(
    response: Response, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    """Require both PostgreSQL connectivity and the expected operational schema."""
    try:
        await db.execute(text("SELECT 1"))
        await db.execute(text("SELECT 1 FROM worker_heartbeats LIMIT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unavailable",
            "database": "unavailable",
            "schema": "unavailable",
        }

    return {"status": "ok", "database": "ok", "schema": "ok"}


@app.get("/health", summary="Service health")
async def health_check(
    response: Response, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "database": "unavailable"}
    return {"status": "ok", "database": "ok"}


def _worker_health_payload(
    row: WorkerHeartbeat | None,
    *,
    worker_name: str,
    stale_after_seconds: int,
    now: datetime,
) -> dict:
    if row is None:
        return {
            "worker": worker_name,
            "status": "missing",
            "stale_after_seconds": stale_after_seconds,
        }

    heartbeat = row.last_heartbeat_at
    if heartbeat.tzinfo is None:
        heartbeat = heartbeat.replace(tzinfo=timezone.utc)

    age_seconds = max(0, int((now - heartbeat).total_seconds()))

    if age_seconds > stale_after_seconds:
        worker_status = "stale"
    elif row.consecutive_failures > 0:
        worker_status = "failing"
    else:
        worker_status = "healthy"

    return {
        "worker": worker_name,
        "status": worker_status,
        "heartbeat_age_seconds": age_seconds,
        "stale_after_seconds": stale_after_seconds,
        "consecutive_failures": row.consecutive_failures,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "last_heartbeat_at": row.last_heartbeat_at.isoformat()
        if row.last_heartbeat_at
        else None,
        "last_success_at": row.last_success_at.isoformat()
        if row.last_success_at
        else None,
        "last_failure_at": row.last_failure_at.isoformat()
        if row.last_failure_at
        else None,
        "last_batch_summary": row.last_batch_summary or {},
    }


@app.get("/health/workers", summary="Background worker health")
async def worker_health_check(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Report independently running worker heartbeat and batch health."""
    notification = await db.get(WorkerHeartbeat, "notification-worker")
    payment = await db.get(WorkerHeartbeat, "payment-recovery-worker")

    notification_interval = max(1, settings.notification_worker_interval_seconds)
    payment_interval = max(
        1, int(os.getenv("PAYMENT_CHECKOUT_RECOVERY_INTERVAL_SECONDS", "60"))
    )

    # Allow several normal iterations plus scheduling/database jitter before
    # declaring a worker stale.
    notification_stale = max(120, notification_interval * 4)
    payment_stale = max(180, payment_interval * 4)

    now = datetime.now(timezone.utc)
    workers = {
        "notification-worker": _worker_health_payload(
            notification,
            worker_name="notification-worker",
            stale_after_seconds=notification_stale,
            now=now,
        ),
        "payment-recovery-worker": _worker_health_payload(
            payment,
            worker_name="payment-recovery-worker",
            stale_after_seconds=payment_stale,
            now=now,
        ),
    }

    overall = (
        "healthy"
        if all(item["status"] == "healthy" for item in workers.values())
        else "degraded"
    )

    return {"status": overall, "workers": workers}


@paid_features_router.post("/send-birthday-message", status_code=501)
@limiter.limit("1/45seconds")
async def send_message(request: Request):
    """Birthday messages are sent client-side by the content script.

    This endpoint exists as a placeholder for potential future server-side
    sending.  It is not used by the extension and always returns 501.
    """
    return JSONResponse(
        status_code=501,
        content={
            "detail": "Not implemented. Birthday messages are sent by the content script."
        },
    )


# Mount the complete paid feature surface after all paid routes are declared.
app.include_router(paid_features_router)
