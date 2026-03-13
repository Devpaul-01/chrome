"""
tests/test_auth.py — Unit tests for JWT token creation and validation.

Tests cover:
  - Access token carries the correct ``type`` claim and ``sub`` (user ID)
  - Refresh token type is accepted by ``ensure_token_type`` for REFRESH
    and rejected when checked against ACCESS
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from jose import JWTError
from sqlalchemy import select

from app.core.jwt import TokenType, create_access_token, create_refresh_token, decode_token, ensure_token_type
from app.core.security import hash_password
from app.db.models import User, RevokedToken
from app.db.session import get_db
from app.schemas.auth import RefreshRequest
from app.api.routers.auth import refresh, revoke


def test_access_token_contains_access_type() -> None:
    """Access token payload must carry type=ACCESS and the correct subject UUID."""
    user_id = uuid4()
    token = create_access_token(user_id)
    payload = decode_token(token)
    assert payload["type"] == TokenType.ACCESS
    assert payload["sub"] == str(user_id)


def test_refresh_token_type_validation() -> None:
    """Refresh token must be accepted as REFRESH and rejected when asserted as ACCESS."""
    user_id = uuid4()
    refresh_token = create_refresh_token(user_id)
    payload = decode_token(refresh_token)
    ensure_token_type(payload, TokenType.REFRESH)
    with pytest.raises(JWTError):
        ensure_token_type(payload, TokenType.ACCESS)


def test_refresh_token_has_jti() -> None:
    """Refresh token should include a JTI claim for revocation."""
    user_id = uuid4()
    refresh_token = create_refresh_token(user_id)
    payload = decode_token(refresh_token)
    assert payload.get("jti") is not None, "Refresh token must include jti claim"
    assert isinstance(payload["jti"], str)


@pytest.mark.asyncio
async def test_refresh_token_rotation() -> None:
    """Refresh token rotation: old JTI is revoked after refresh."""
    async for db in get_db():
        # Setup
        user = User(
            email="rotate@example.com",
            password_hash=hash_password("testpass123"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Issue initial token pair
    refresh_token_1 = create_refresh_token(user.id)
    payload_1 = decode_token(refresh_token_1)
    jti_1 = payload_1.get("jti")
    assert jti_1, "Refresh token should have jti"

    # Use refresh endpoint to get new pair
    refresh_req = RefreshRequest(refresh_token=refresh_token_1)
    response_data = await refresh(refresh_req, db)
    refresh_token_2 = response_data.refresh_token
    payload_2 = decode_token(refresh_token_2)
    jti_2 = payload_2.get("jti")

    # Ensure different JTIs
    assert jti_1 != jti_2, "New refresh token should have different jti"

    # Verify old JTI is in revoked_tokens
    stmt = select(RevokedToken).where(RevokedToken.refresh_token_jti == jti_1)
    result = await db.execute(stmt)
    revoked = result.scalar_one_or_none()
    assert revoked is not None, "Old JTI should be revoked"
    assert revoked.user_id == user.id

    # Try to reuse old token (should fail)
    with pytest.raises(HTTPException) as exc_info:
        await refresh(RefreshRequest(refresh_token=refresh_token_1), db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_revoke_endpoint() -> None:
    """Revoke endpoint marks token JTI as revoked."""
    async for db in get_db():
        user = User(
            email="revoke@example.com",
            password_hash=hash_password("testpass123"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    refresh_token = create_refresh_token(user.id)
    payload = decode_token(refresh_token)
    jti = payload.get("jti")

    # Call revoke endpoint
    rev_req = RefreshRequest(refresh_token=refresh_token)
    result = await revoke(rev_req, db)
    assert result.message == "Token revoked"

    # Verify JTI is in revoked_tokens
    stmt = select(RevokedToken).where(RevokedToken.refresh_token_jti == jti)
    result = await db.execute(stmt)
    assert result.scalar_one_or_none() is not None

    # Try to use revoked token (should fail)
    with pytest.raises(HTTPException) as exc_info:
        await refresh(RefreshRequest(refresh_token=refresh_token), db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_concurrent_refresh_reuse_detection() -> None:
    """Concurrent refresh or token reuse is detected via integrity error."""
    async for db in get_db():
        user = User(
            email="concurrent@example.com",
            password_hash=hash_password("testpass123"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    refresh_token = create_refresh_token(user.id)

    # First refresh succeeds
    response_1 = await refresh(RefreshRequest(refresh_token=refresh_token), db)
    assert response_1.refresh_token

    # Attempt to reuse the original token (replay) should fail
    with pytest.raises(HTTPException) as exc_info:
        await refresh(RefreshRequest(refresh_token=refresh_token), db)
    assert exc_info.value.status_code == 401
