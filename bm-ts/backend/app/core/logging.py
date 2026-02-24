"""
core/logging.py — Application-wide logging setup.

Configure once at startup (called from main.py before the app instance is
created) so that all subsequent ``logging.getLogger(__name__)`` calls across
the codebase inherit the root logger's level and format.
"""

import logging

from app.core.config import settings


def setup_logging() -> None:
    """Configure the root logger using the level from ``settings.log_level``."""
    logging.basicConfig(
        level=settings.log_level,
        # Include timestamp, level, logger name, and message for easy log parsing.
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
