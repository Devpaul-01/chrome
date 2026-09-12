"""
tests/test_email_verification.py — Tests for the email verification token service and endpoints.

Covers: token creation, verification, expiry, mark-as-used, and endpoint wiring.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, EmailVerificationToken
from app.services.email_verification import (
    create_verification_token,
    verify_verification_token,
    mark_token_used,
)
from app.core.security import hash_password


@pytest_asyncio.fixture
async def verify_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid4(),
        email="verify@example.com",
        password_hash=hash_password("VerifyPass123!"),
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
async def test_create_verification_token_returns_raw(
    db_session: AsyncSession, verify_user: User
) -> None:
    raw_token = await create_verification_token(verify_user, db_session)
    assert isinstance(raw_token, str)
    assert len(raw_token) > 20


@pytest.mark.asyncio
async def test_create_verification_token_stores_hash(
    db_session: AsyncSession, verify_user: User
) -> None:
    raw_token = await create_verification_token(verify_user, db_session)
    expected_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    from sqlalchemy import select

    result = await db_session.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == verify_user.id
        )
    )
    stored = result.scalar_one()
    assert stored.token == expected_hash


@pytest.mark.asyncio
async def test_verify_valid_token(db_session: AsyncSession, verify_user: User) -> None:
    raw_token = await create_verification_token(verify_user, db_session)
    user = await verify_verification_token(raw_token, db_session)
    assert user is not None
    assert user.id == verify_user.id


@pytest.mark.asyncio
async def test_verify_invalid_token(db_session: AsyncSession) -> None:
    user = await verify_verification_token("bogus-token-value", db_session)
    assert user is None


@pytest.mark.asyncio
async def test_verify_expired_token(
    db_session: AsyncSession, verify_user: User
) -> None:
    raw_token = "expired-verify-token"
    hash_token = hashlib.sha256(raw_token.encode()).hexdigest()
    expired = EmailVerificationToken(
        user_id=verify_user.id,
        token=hash_token,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        used_at=None,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(expired)
    await db_session.commit()

    user = await verify_verification_token(raw_token, db_session)
    assert user is None


@pytest.mark.asyncio
async def test_mark_token_used(db_session: AsyncSession, verify_user: User) -> None:
    raw_token = await create_verification_token(verify_user, db_session)
    await mark_token_used(raw_token, db_session)

    from sqlalchemy import select

    result = await db_session.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == verify_user.id
        )
    )
    stored = result.scalar_one()
    assert stored.used_at is not None


@pytest.mark.asyncio
async def test_used_token_cannot_be_verified(
    db_session: AsyncSession, verify_user: User
) -> None:
    raw_token = await create_verification_token(verify_user, db_session)
    await mark_token_used(raw_token, db_session)

    user = await verify_verification_token(raw_token, db_session)
    assert user is None


# Endpoint tests: ensure request-email-verification triggers send (monkeypatch)
@pytest.mark.asyncio
async def test_request_email_verification_endpoint_triggers_send(
    async_client, db_session, monkeypatch
) -> None:
    sent = {"called": False}

    async def fake_send(email: str, token: str):
        sent["called"] = True

    monkeypatch.setattr("app.api.routers.auth.send_verification_email", fake_send)

    resp = await async_client.post(
        "/auth/request-email-verification",
        json={"email": "testuser@example.com"},
    )
    assert resp.status_code == 200
    assert sent["called"]


@pytest.mark.asyncio
async def test_verify_email_endpoint_marks_verified(
    db_session: AsyncSession, async_client
) -> None:
    # create a token for the test_user (fixture user already exists)
    from app.db.models import User as UserModel
    from sqlalchemy import select

    result = await db_session.execute(
        select(UserModel).where(UserModel.email == "testuser@example.com")
    )
    test_user = result.scalar_one()

    from app.services.email_verification import create_verification_token

    raw_token = await create_verification_token(test_user, db_session)

    resp = await async_client.post("/auth/verify-email", json={"token": raw_token})
    assert resp.status_code == 200

    # confirm user is marked verified
    result = await db_session.execute(
        select(UserModel).where(UserModel.id == test_user.id)
    )
    refreshed = result.scalar_one()
    assert refreshed.email_verified is True
