"""
core/security_headers.py — Middleware that injects standard security headers
on every HTTP response.

Headers applied:
    Strict-Transport-Security   — force HTTPS for 1 year (+ subdomains)
    X-Frame-Options            — prevent clickjacking
    X-Content-Type-Options     — disable MIME-type sniffing
    Content-Security-Policy    — restrict resource origins
    Referrer-Policy            — limit referrer leakage

Swagger UI and ReDoc require external JavaScript/CSS resources. Those
resources are allowed only on the documentation routes so that the
application's normal routes retain the stricter CSP.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    # Paths that serve self-contained HTML pages with inline scripts/styles.
    _INLINE_ALLOWED_PATHS = {
        "/auth/reset-password-page",
        "/auth/verify-email-page",
    }

    # FastAPI documentation pages load their UI assets from jsDelivr.
    _DOCS_PATHS = {
        "/docs",
        "/redoc",
    }

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        response = await call_next(request)

        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"

        path = request.url.path

        if path in self._DOCS_PATHS:
            # Swagger UI / ReDoc documentation only.
            # Keep this exception limited to documentation routes.
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https://fastapi.tiangolo.com; "
                "font-src 'self' data: https://cdn.jsdelivr.net; "
                "connect-src 'self'"
            )

        elif path in self._INLINE_ALLOWED_PATHS:
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'unsafe-inline'; "
                "connect-src 'self'"
            )

        else:
            # Default strict CSP for application/API routes.
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "style-src 'self'"
            )

        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )

        # Prevent caching of authentication responses.
        if path.startswith("/auth"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"

        return response