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

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.jwt import TokenType, decode_token, ensure_token_type
from app.db.models import User, UserSession
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _as_utc(value: datetime) -> datetime:
    """Return a timezone-aware UTC datetime for DB values that may be naive in tests."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _raise_credentials_error() -> HTTPException:
    """Return a 401 HTTPException with a WWW-Authenticate header — used throughout the auth flow."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
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
        select(UserSession).where(UserSession.id == session_uuid, UserSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        raise _raise_credentials_error()

    if _as_utc(session.expires_at) <= datetime.now(timezone.utc):
        raise _raise_credentials_error()

    return payload


async def get_current_user(
    payload: dict[str, Any] = Depends(get_current_token_payload), db: AsyncSession = Depends(get_db)
) -> User:
    """
    FastAPI dependency that resolves a Bearer access token to a ``User`` row.

    Raises 401 in any of these cases:
    - Token is malformed, expired, or has an invalid signature.
    - Token ``type`` claim is not ``"access"``.
    - ``sub`` claim is missing or not a valid user ID.
    - No ``User`` row exists for that ID.
    """
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise _raise_credentials_error()
    return user
