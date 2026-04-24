import json
import logging

from app.core.config import settings


class _JsonFormatter(logging.Formatter):
    """Format every log record as a single-line JSON object.

    This makes logs parseable by any external aggregator (Loki, Logtail,
    Datadog, etc.) without requiring a custom ingest pipeline.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Merge any extra= fields the caller attached (e.g. RequestLoggingMiddleware)
        for key, val in record.__dict__.items():
            if key not in logging.LogRecord.__dict__ and not key.startswith("_"):
                payload[key] = val

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack_info"] = self.formatStack(record.stack_info)

        return json.dumps(payload, default=str)


def setup_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    logging.basicConfig(
        level=settings.log_level,
        handlers=[handler],
    )
