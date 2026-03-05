from flask import Flask

from .auth import auth_bp
from .users import user_bp
from .password_reset_api import password_reset_bp
from .message_segments_api import message_segments_bp

def register_routes(app: Flask) -> None:
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(password_reset_bp)
    app.register_blueprint(message_segments_bp)  


__all__ = ["register_routes"]
