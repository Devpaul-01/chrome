from flask import Flask

from .api import register_routes
from .config import get_settings
from .database import init_engine


def create_app() -> Flask:
    settings = get_settings()
    init_engine(settings.db_url)
    app = Flask(__name__)
    register_routes(app)
    return app


__all__ = ["create_app"]