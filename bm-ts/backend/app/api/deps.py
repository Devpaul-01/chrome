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

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.jwt import TokenType, decode_token, ensure_token_type
from app.db.models import User
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _raise_credentials_error() -> HTTPException:
    """Return a 401 HTTPException with a WWW-Authenticate header — used throughout the auth flow."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    """
    FastAPI dependency that resolves a Bearer access token to a ``User`` row.

    Raises 401 in any of these cases:
    - Token is malformed, expired, or has an invalid signature.
    - Token ``type`` claim is not ``"access"``.
    - ``sub`` claim is missing or not a valid user ID.
    - No ``User`` row exists for that ID.
    """
    try:
        payload = decode_token(token)
        ensure_token_type(payload, TokenType.ACCESS)
        user_id = payload.get("sub")
        if user_id is None:
            raise _raise_credentials_error()
    except JWTError:
        raise _raise_credentials_error()

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise _raise_credentials_error()
    return user
