"""Audit logging middleware for security-sensitive operations.

Logs authentication events (login, register, password change, account delete)
and configuration changes (SMTP config update) with structured context.
"""

import logging
import time
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("audit")

# Routes and methods considered security-sensitive.
_SENSITIVE_OPERATIONS: dict[tuple[str, str], str] = {
    ("POST", "/auth/register"): "account.register",
    ("POST", "/auth/login"): "account.login",
    ("POST", "/auth/logout"): "account.logout",
    ("POST", "/auth/refresh"): "token.refresh",
    ("PUT", "/auth/password"): "account.password_change",
    ("DELETE", "/auth/account"): "account.delete",
    ("PUT", "/smtp/config"): "smtp.config_update",
    ("POST", "/auth/request-password-reset"): "account.password_reset_request",
    ("POST", "/auth/reset-password"): "account.password_reset",
}


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Emit structured audit log entries for security-sensitive endpoints."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        operation = _SENSITIVE_OPERATIONS.get((request.method, request.url.path))
        if operation is None:
            return await call_next(request)

        start = time.monotonic()
        response: Response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000)

        client_ip = request.client.host if request.client else "unknown"

        log_data = {
            "event": operation,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "ip": client_ip,
            "duration_ms": duration_ms,
            "user_agent": request.headers.get("user-agent", ""),
        }

        if response.status_code < 400:
            logger.info("audit.success %s", log_data)
        else:
            logger.warning("audit.failure %s", log_data)

        return response
