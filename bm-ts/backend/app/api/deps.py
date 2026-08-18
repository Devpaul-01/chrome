"""
api/deps.py — FastAPI dependency functions shared across all routers.

The primary export is ``get_current_user``, which is used as
``Depends(get_current_user)`` on every authenticated route.  It:
  1. Extracts the Bearer token from the ``Authorization`` header via
     ``OAuth2PasswordBearer``.
  2. Decodes and validates the JWT (signature + expiry + ``type == access``).
  3. Looks up the ``User`` row in the database.
  4. Returns the ``User`` ORM object, or raises 401 if any step fails.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import Depends, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.errors import AppError, ErrorCodes
from app.core.jwt import JWTError, TokenType, decode_token, ensure_token_type
from app.db.models import AccessEntitlement, User, UserSession
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def _as_utc(value: datetime) -> datetime:
    """Return a timezone-aware UTC datetime for DB values that may be naive in tests."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _raise_credentials_error() -> AppError:
    """Return a 401 AppError with a WWW-Authenticate header — used throughout the auth flow."""
    raise AppError(
        status_code=status.HTTP_401_UNAUTHORIZED,
        code=ErrorCodes.INVALID_CREDENTIALS,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_token_payload(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Decode an access token and verify its backing session when present."""
    try:
        payload = decode_token(token)
        ensure_token_type(payload, TokenType.ACCESS)
        raw_user_id = payload.get("sub")
        if raw_user_id is None:
            raise _raise_credentials_error()
        user_id = UUID(str(raw_user_id))
    except JWTError:
        raise _raise_credentials_error()
    except ValueError as exc:
        raise _raise_credentials_error() from exc

    payload["sub"] = user_id

    session_id = payload.get("sid")
    if session_id is None:
        return payload

    try:
        session_uuid = UUID(str(session_id))
    except ValueError as exc:
        raise _raise_credentials_error() from exc

    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_uuid, UserSession.user_id == user_id
        )
    )
    session = result.scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        raise _raise_credentials_error()

    if _as_utc(session.expires_at) <= datetime.now(timezone.utc):
        raise _raise_credentials_error()

    return payload


async def get_current_user(
    payload: dict[str, Any] = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency that resolves a Bearer access token to a ``User`` row.

    Raises 401 in any of these cases:
    - Token is malformed, expired, or has an invalid signature.
    - Token ``type`` claim is not ``"access"``.
    - ``sub`` claim is missing or not a valid user ID.
    - No ``User`` row exists for that ID.

    Raises 403 if the user's email is not verified or the account is locked.
    """
    user = await _resolve_user(payload, db)

    # Enforce email verification and account lockout
    if hasattr(user, "email_verified") and not user.email_verified:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code=ErrorCodes.EMAIL_NOT_VERIFIED,
            detail="Email not verified",
        )
    if hasattr(user, "locked_until") and user.locked_until is not None:
        locked = user.locked_until
        if locked.tzinfo is None:
            locked = locked.replace(tzinfo=timezone.utc)
        if locked > datetime.now(timezone.utc):
            raise AppError(
                status_code=status.HTTP_403_FORBIDDEN,
                code=ErrorCodes.ACCOUNT_LOCKED,
                detail="Account is temporarily locked",
            )

    return user


async def get_current_user_allow_unverified(
    payload: dict[str, Any] = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Like ``get_current_user`` but skips the email-verification check.

    Use on endpoints that an authenticated-but-unverified user must be able to
    reach (e.g. ``/auth/me``, ``/auth/change-password``, ``/auth/logout``).
    Account-lockout is still enforced.
    """
    user = await _resolve_user(payload, db)

    if hasattr(user, "locked_until") and user.locked_until is not None:
        locked = user.locked_until
        if locked.tzinfo is None:
            locked = locked.replace(tzinfo=timezone.utc)
        if locked > datetime.now(timezone.utc):
            raise AppError(
                status_code=status.HTTP_403_FORBIDDEN,
                code=ErrorCodes.ACCOUNT_LOCKED,
                detail="Account is temporarily locked",
            )

    return user


async def _resolve_user(payload: dict[str, Any], db: AsyncSession) -> User:
    """Shared helper — loads User by token ``sub`` claim, raises 401 if not found."""
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise _raise_credentials_error()
    return user

async def require_active_entitlement(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AccessEntitlement:
    """Require currently effective paid application access for ``current_user``.

    Authentication and paid authorization intentionally remain separate:
    ``get_current_user`` proves who the caller is and enforces account safety;
    this dependency proves that the authenticated account currently owns an
    effective provider-neutral ``AccessEntitlement``.

    Access is granted only when an entitlement is simultaneously:
    - owned by the authenticated user;
    - marked ``ACTIVE``;
    - already started (``starts_at <= now``); and
    - not expired (``expires_at > now``).

    The timestamp check is authoritative even if a background expiration job
    is delayed and has not yet changed an old row from ``ACTIVE`` to
    ``EXPIRED``.  This dependency is read-only; lifecycle cleanup belongs in a
    separate maintenance/service task.

    Raises structured 403 ``AppError`` responses that let the client
    distinguish purchase, renewal, future-start, and inactive-access states.
    """
    now = datetime.now(timezone.utc)

    current_result = await db.execute(
        select(AccessEntitlement)
        .where(
            AccessEntitlement.user_id == current_user.id,
            AccessEntitlement.status == "ACTIVE",
            AccessEntitlement.starts_at <= now,
            AccessEntitlement.expires_at > now,
        )
        .order_by(AccessEntitlement.expires_at.desc())
        .limit(1)
    )
    entitlement = current_result.scalar_one_or_none()
    if entitlement is not None:
        return entitlement

    # No effective entitlement exists.  Inspect the account's latest access
    # history only to choose a precise, stable client-facing error code.
    latest_result = await db.execute(
        select(AccessEntitlement)
        .where(AccessEntitlement.user_id == current_user.id)
        .order_by(AccessEntitlement.expires_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()

    if latest is None:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code=ErrorCodes.SUBSCRIPTION_REQUIRED,
            detail="An active subscription is required to use this feature.",
        )

    starts_at = _as_utc(latest.starts_at)
    expires_at = _as_utc(latest.expires_at)

    if expires_at <= now:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code=ErrorCodes.SUBSCRIPTION_EXPIRED,
            detail="Your subscription has expired. Renew your plan to continue.",
        )

    if starts_at > now:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code=ErrorCodes.SUBSCRIPTION_NOT_YET_ACTIVE,
            detail="Your subscription access has not started yet.",
        )

    raise AppError(
        status_code=status.HTTP_403_FORBIDDEN,
        code=ErrorCodes.SUBSCRIPTION_INACTIVE,
        detail="Your subscription is not currently active.",
    )
