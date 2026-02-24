"""
main.py — FastAPI application factory and router registration.

Startup order:
  1. Logging is configured via ``setup_logging()``.
  2. The FastAPI application is created with CORS middleware allowing
     ``chrome-extension://`` origins so the browser extension can call the API.
  3. The SlowAPI rate-limiting middleware is attached via ``init_rate_limiter``.
  4. All routers are registered with their path prefixes and OpenAPI tags.

Router layout
-------------
Prefix-less (own prefix in router):
  /auth/*                auth + password-reset
  /smtp/*                SMTP config (prefix set inside the router)
  /templates/*           legacy template segments
  /subscription/*        Stripe subscription status & checkout
  /stripe/*              Stripe webhook
  /ws                    WebSocket real-time updates

/api prefix:
  /api/schedules         birthday schedules
  /api/messages          message queue & history
  /api/dashboard         dashboard stats & birthday configs
  /api/contacts          contact CRUD
  /api/message-groups    message group CRUD
  /api/message-templates full message-template CRUD
  /api/posts             timeline post CRUD
  /api/images            user image library
  /api/birthday-configs  birthday automation config
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

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
    smtp,
)
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.rate_limiter import init_rate_limiter, limiter

setup_logging()

app = FastAPI(
    title="BirthdayMessaging API",
    version="0.1.0",
    description="Backend API for the BirthdayMessaging Chrome Extension",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"chrome-extension://[a-z]{32}",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_rate_limiter(app)

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

# Phase 2 - Contact and message management
app.include_router(contacts.router, prefix="/api", tags=["contacts"])
app.include_router(message_groups.router, prefix="/api", tags=["message-groups"])
app.include_router(message_templates.router, prefix="/api", tags=["message-templates"])

# Phase 2 - Posts and images
app.include_router(posts.router, prefix="/api", tags=["posts"])
app.include_router(images.router, prefix="/api", tags=["images"])

# Phase 2 - Birthday configurations
app.include_router(birthday_configs.router, prefix="/api", tags=["birthday-configs"])


@app.get("/health", summary="Service health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}

# TODO: finish implementation — currently a stub that returns immediately.
@app.post("/send-birthday-message")
@limiter.limit("1/45seconds")
async def send_message(request: Request):
    return {"status": "sent"}
