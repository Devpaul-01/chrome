"""
core/rate_limiter.py — SlowAPI-based rate limiting integration.

The limiter keys on the Facebook user ID if available, then falls back
to remote IP, then to ``"anonymous"``.

Call ``init_rate_limiter(app)`` once during application startup (in main.py)
to attach the middleware and exception handler.
"""

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


def fb_user_key(request):
    """Rate-limit key function — Facebook user ID → IP → anonymous."""
    fb_id = getattr(request.state, "fb_user_id", None)
    if fb_id:
        return fb_id

    ip = get_remote_address(request)
    if ip:
        return ip

    return "anonymous"


# Module-level limiter instance shared across routes via ``@limiter.limit``.
limiter = Limiter(key_func=fb_user_key)


def init_rate_limiter(app):
    """Attach SlowAPI middleware and the 429 exception handler to the FastAPI application."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)