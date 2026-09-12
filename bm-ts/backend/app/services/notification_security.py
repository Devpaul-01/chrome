"""Privacy-safe notification diagnostics.

Persist and log stable error categories, never arbitrary provider exception text.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.notification_providers import NotificationDeliveryError


@dataclass(frozen=True, slots=True)
class SafeFailure:
    code: str
    detail: str
    retryable: bool
    exception_type: str


def classify_delivery_failure(exc: Exception) -> SafeFailure:
    if isinstance(exc, NotificationDeliveryError):
        return SafeFailure(
            code=exc.code,
            detail="Notification provider delivery failed.",
            retryable=exc.retryable,
            exception_type=type(exc).__name__,
        )
    return SafeFailure(
        code="notification_delivery_error",
        detail="Notification delivery failed.",
        retryable=True,
        exception_type=type(exc).__name__,
    )
