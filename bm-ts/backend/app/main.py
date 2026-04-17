import logging

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers import (
    auth,
    templates,
    subscription,
    webhook,
    schedules,
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
from app.db.models import User
from app.db.session import get_db

setup_logging()

openapi_tags = [
    {
        "name": "auth",
        "description": "Authentication, registration, password management, and session control",
    },
    {
        "name": "templates",
        "description": "CRUD for template segments (greeting / body / closing)",
    },
    {
        "name": "schedules",
        "description": "Birthday schedule management (days-before triggers)",
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all so that 500 responses still carry CORS headers."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    origin = request.headers.get("origin", "")
    headers: dict[str, str] = {}
    if origin in settings.cors_origins:
        headers["access-control-allow-origin"] = origin
        headers["access-control-allow-credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


# Auth and core endpoints
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(smtp.router)  # /smtp prefix defined in router
app.include_router(templates.router, prefix="/templates", tags=["templates"])
app.include_router(subscription.router, prefix="/subscription", tags=["subscription"])
app.include_router(webhook.router, prefix="/stripe", tags=["stripe"])

# Phase 1 - Registered routers
app.include_router(schedules.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(websocket.router)

# Phase 2 - Contacts (populated automatically via scraping; UI currently disabled)
app.include_router(contacts.router, prefix="/api", tags=["contacts"])

# Phase 2 - Message management
app.include_router(message_groups.router, prefix="/api", tags=["message-groups"])
app.include_router(message_templates.router, prefix="/api", tags=["message-templates"])

# Phase 2 - Posts and images
app.include_router(posts.router, prefix="/api", tags=["posts"])
app.include_router(images.router, prefix="/api", tags=["images"])

# Phase 2 - Birthday configurations
app.include_router(birthday_configs.router, prefix="/api", tags=["birthday-configs"])

# Phase 2 - Rate limiting
app.include_router(rate_limits.router, prefix="/api", tags=["rate-limits"])


@app.get("/health", summary="Service health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "unavailable"
    return {"status": "ok", "database": db_status}


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
