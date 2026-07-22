import logging
from datetime import datetime, timezone

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from fastapi import Depends, FastAPI, Request, Response, status
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
)
from app.core.config import settings
from app.core.app_logging import setup_logging
from app.core.audit_log import AuditLogMiddleware
from app.core.rate_limiter import init_rate_limiter, limiter
from app.core.request_logging import RequestLoggingMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.api.deps import get_current_user
from app.core.errors import AppError, ErrorCodes
from app.db.models import User
from app.db.session import get_db

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
]

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
    allow_headers=["Authorization", "Content-Type", "Accept"],
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


# Auth and core endpoints
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(smtp.router)  # /smtp prefix defined in router
app.include_router(templates.router, prefix="/templates", tags=["templates"])
app.include_router(subscription.router, prefix="/subscription", tags=["subscription"])
app.include_router(webhook.router, prefix="/stripe", tags=["stripe"])

# Core API routers
app.include_router(messages.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(websocket.router)

# Contacts — auto-populated via Facebook scraping; add/edit UI is disabled (popup shows read-only list)
app.include_router(contacts.router, prefix="/api", tags=["contacts"])

# Message management
app.include_router(message_groups.router, prefix="/api", tags=["message-groups"])
app.include_router(message_templates.router, prefix="/api", tags=["message-templates"])

# Posts and images
app.include_router(posts.router, prefix="/api", tags=["posts"])
app.include_router(images.router, prefix="/api", tags=["images"])

# Birthday configurations
app.include_router(birthday_configs.router, prefix="/api", tags=["birthday-configs"])

# Rate limiting
app.include_router(rate_limits.router, prefix="/api", tags=["rate-limits"])


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


@app.post("/send-birthday-message", status_code=501)
@limiter.limit("1/45seconds")
async def send_message(request: Request, _user: User = Depends(get_current_user)):
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
