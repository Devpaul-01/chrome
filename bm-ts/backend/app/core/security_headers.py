"""
core/security_headers.py — Middleware that injects standard security headers
on every HTTP response.

Headers applied:
  Strict-Transport-Security   — force HTTPS for 1 year (+ subdomains)
  X-Frame-Options             — prevent clickjacking
  X-Content-Type-Options      — disable MIME-type sniffing
  Content-Security-Policy     — restrict resource origins
  Referrer-Policy             — limit referrer leakage
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    # Paths that serve self-contained HTML pages with inline scripts/styles.
    _INLINE_ALLOWED_PATHS = ("/auth/reset-password-page", "/auth/verify-email-page")

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"

        if request.url.path in self._INLINE_ALLOWED_PATHS:
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; script-src 'self' 'unsafe-inline'; "
                "style-src 'unsafe-inline'; connect-src 'self'"
            )
        else:
            response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self'"

        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        # Prevent caching of auth responses
        if request.url.path.startswith("/auth"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"

        return response
