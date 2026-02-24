"""
core/rate_limiter.py — SlowAPI-based rate limiting integration.

The limiter keys on ``request.state.facebook_user_id`` so that rate limits are
enforced per Facebook user rather than per IP address.  This is appropriate for
the send-birthday-message endpoint because each Facebook account should be
capped independently regardless of the IP it connects from.

Call ``init_rate_limiter(app)`` once during application startup (in main.py)
to attach the middleware and exception handler.
"""

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded


def fb_user_key(request):
    """Rate-limit key function — returns the Facebook user ID stored on request state."""
    return request.state.facebook_user_id


# Module-level limiter instance shared across routes via ``@limiter.limit``.
limiter = Limiter(key_func=fb_user_key)


def init_rate_limiter(app):
    """Attach SlowAPI middleware and the 429 exception handler to the FastAPI application."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)