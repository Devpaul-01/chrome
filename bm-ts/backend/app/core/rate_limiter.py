from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

def fb_user_key(request):
    fb_id = getattr(request.state, "fb_user_id", None)
    if fb_id:
        return fb_id
    
    ip = get_remote_address(request)
    if ip:
        return ip
    
    return "anonymous"

limiter = Limiter(key_func=fb_user_key)

def init_rate_limiter(app):
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)