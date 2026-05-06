"""
core/errors.py — Structured application error infrastructure.

Usage in routers
----------------
    from app.core.errors import AppError, ErrorCodes

    raise AppError(status.HTTP_404_NOT_FOUND, ErrorCodes.NOT_FOUND, "Image not found")

    # With extra headers (e.g. WWW-Authenticate):
    raise AppError(
        status.HTTP_401_UNAUTHORIZED,
        ErrorCodes.INVALID_CREDENTIALS,
        "Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # With per-field validation errors (rarely needed manually; 422s are handled
    # automatically by the RequestValidationError exception handler):
    raise AppError(
        status.HTTP_400_BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        "Validation error",
        errors=[FieldError(field="email", message="Invalid format")],
    )

All unhandled AppError instances are caught by the handler registered in
main.py and serialised to the standard ErrorResponse schema.
"""

from __future__ import annotations

from typing import Any, Optional, NoReturn

from app.schemas.common import FieldError


# ---------------------------------------------------------------------------
# Error code constants
# ---------------------------------------------------------------------------

class ErrorCodes:
    # Authentication / session
    INVALID_CREDENTIALS = "invalid_credentials"
    INVALID_REFRESH_TOKEN = "invalid_refresh_token"
    EMAIL_ALREADY_REGISTERED = "email_already_registered"
    EMAIL_NOT_VERIFIED = "email_not_verified"
    ACCOUNT_LOCKED = "account_locked"
    USER_NOT_FOUND = "user_not_found"
    SESSION_NOT_FOUND = "session_not_found"
    INVALID_VERIFICATION_TOKEN = "invalid_verification_token"
    INVALID_RESET_TOKEN = "invalid_reset_token"
    INVALID_PASSWORD = "invalid_password"

    # Generic resource errors
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"

    # Resource-specific not-found codes
    IMAGE_NOT_FOUND = "image_not_found"
    MESSAGE_NOT_FOUND = "message_not_found"
    CONTACT_NOT_FOUND = "contact_not_found"
    GROUP_NOT_FOUND = "group_not_found"
    TEMPLATE_NOT_FOUND = "template_not_found"
    POST_NOT_FOUND = "post_not_found"
    BIRTHDAY_CONFIG_NOT_FOUND = "birthday_config_not_found"
    SMTP_CONFIG_NOT_FOUND = "smtp_config_not_found"
    SUBSCRIPTION_NOT_FOUND = "subscription_not_found"

    # Request / input errors
    INVALID_IMAGE_DATA = "invalid_image_data"
    IMAGE_SIZE_MISMATCH = "image_size_mismatch"
    FILE_TOO_LARGE = "file_too_large"
    UNSUPPORTED_MEDIA_TYPE = "unsupported_media_type"
    INVALID_MESSAGE_STATE = "invalid_message_state"
    SUBSCRIPTION_NOT_PENDING_CANCELLATION = "subscription_not_pending_cancellation"
    ALREADY_ON_PLAN = "already_on_plan"
    NO_BILLING_ACCOUNT = "no_billing_account"
    MISSING_STRIPE_SIGNATURE = "missing_stripe_signature"
    INVALID_STRIPE_PAYLOAD = "invalid_stripe_payload"
    INVALID_STRIPE_SIGNATURE = "invalid_stripe_signature"
    MISSING_SEGMENTS = "missing_segments"

    # System
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    VALIDATION_ERROR = "validation_error"
    INTERNAL_SERVER_ERROR = "internal_server_error"
    NOT_IMPLEMENTED = "not_implemented"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    BAD_REQUEST = "bad_request"


# ---------------------------------------------------------------------------
# AppError exception
# ---------------------------------------------------------------------------

class AppError(Exception):
    """Raise instead of HTTPException to produce a structured error response.

    Parameters
    ----------
    status_code:
        HTTP status code (use ``fastapi.status`` constants).
    code:
        Machine-readable snake_case error code from ``ErrorCodes``.
    detail:
        Human-readable explanation for this specific occurrence.
    errors:
        Optional list of per-field validation errors.
    headers:
        Optional HTTP headers to include in the response (e.g.
        ``{"WWW-Authenticate": "Bearer"}`` for 401 responses).
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        detail: str,
        *,
        errors: Optional[list[FieldError]] = None,
        headers: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.code = code
        self.detail = detail
        self.errors = errors
        self.headers = headers


def raise_app_error(
    status_code: int,
    code: str,
    detail: str,
    *,
    errors: Optional[list[FieldError]] = None,
    headers: Optional[dict[str, Any]] = None,
) -> NoReturn:
    """Convenience one-liner that constructs and raises an ``AppError``."""
    raise AppError(status_code, code, detail, errors=errors, headers=headers)
