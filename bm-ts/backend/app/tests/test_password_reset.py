"""
tests/test_password_reset.py — Tests for the password reset token service.

Covers: token creation, verification, expiry, mark-as-used, and reuse prevention.
Tests use the service functions directly (no HTTP) with a mocked async session.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, PasswordResetToken
from app.core.security import hash_password
from app.services.password_reset import (
    create_reset_token,
    verify_reset_token,
    mark_token_used,
)


@pytest_asyncio.fixture
async def reset_user(db_session: AsyncSession) -> User:
    """Separate user for password reset tests."""
    user = User(
        id=uuid4(),
        email="reset@example.com",
        password_hash=hash_password("ResetPass123!"),
        last_login_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        failed_login_count=0,
        locked_until=None,
        email_verified=False,
        metadata_payload={},
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_create_reset_token_returns_raw(
    db_session: AsyncSession, reset_user: User
) -> None:
    """create_reset_token returns a raw token string (not the hash)."""
    raw_token = await create_reset_token(reset_user, db_session)
    assert isinstance(raw_token, str)
    assert len(raw_token) > 20  # URL-safe base64 of 32 bytes


@pytest.mark.asyncio
async def test_create_reset_token_stores_hash(
    db_session: AsyncSession, reset_user: User
) -> None:
    """The stored token is the SHA-256 hash of the raw token."""
    raw_token = await create_reset_token(reset_user, db_session)
    expected_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    from sqlalchemy import select

    result = await db_session.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == reset_user.id)
    )
    stored = result.scalar_one()
    assert stored.token == expected_hash


@pytest.mark.asyncio
async def test_verify_valid_token(db_session: AsyncSession, reset_user: User) -> None:
    """A valid, unexpired, unused token returns the associated user."""
    raw_token = await create_reset_token(reset_user, db_session)
    user = await verify_reset_token(raw_token, db_session)
    assert user is not None
    assert user.id == reset_user.id


@pytest.mark.asyncio
async def test_verify_invalid_token(db_session: AsyncSession) -> None:
    """A random token that doesn't exist returns None."""
    user = await verify_reset_token("bogus-token-value", db_session)
    assert user is None


@pytest.mark.asyncio
async def test_verify_expired_token(db_session: AsyncSession, reset_user: User) -> None:
    """An expired token returns None."""
    raw_token = "expired-test-token"
    hash_token = hashlib.sha256(raw_token.encode()).hexdigest()
    expired = PasswordResetToken(
        user_id=reset_user.id,
        token=hash_token,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        used_at=None,
    )
    db_session.add(expired)
    await db_session.commit()

    user = await verify_reset_token(raw_token, db_session)
    assert user is None


@pytest.mark.asyncio
async def test_mark_token_used(db_session: AsyncSession, reset_user: User) -> None:
    """After mark_token_used, the token's used_at is set."""
    raw_token = await create_reset_token(reset_user, db_session)
    await mark_token_used(raw_token, db_session)

    from sqlalchemy import select

    result = await db_session.execute(
        select(PasswordResetToken).where(PasswordResetToken.user_id == reset_user.id)
    )
    stored = result.scalar_one()
    assert stored.used_at is not None


@pytest.mark.asyncio
async def test_used_token_cannot_be_verified(
    db_session: AsyncSession, reset_user: User
) -> None:
    """A used token is rejected by verify_reset_token."""
    raw_token = await create_reset_token(reset_user, db_session)
    await mark_token_used(raw_token, db_session)

    user = await verify_reset_token(raw_token, db_session)
    assert user is None
