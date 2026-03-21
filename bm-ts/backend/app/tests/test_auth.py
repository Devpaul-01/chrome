"""tests/test_auth.py — Auth token, session rotation, and revocation coverage."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from jose import JWTError
from sqlalchemy import select
from starlette.requests import Request

from app.api.routers.auth import refresh, revoke
from app.core.jwt import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
    ensure_token_type,
)
from app.core.security import hash_password
from app.db.models import RevokedToken, User, UserSession
from app.db.session import get_db
from app.main import app
from app.schemas.auth import RefreshRequest


def _make_request(user_agent: str = "pytest") -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(b"user-agent", user_agent.encode("utf-8"))],
            "client": ("127.0.0.1", 12345),
        }
    )


@pytest_asyncio.fixture
async def real_auth_client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def _create_user(db_session, email: str, password: str = "testpass123") -> User:
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        password_hash=hash_password(password),
        created_at=now,
        updated_at=now,
        last_login_at=now,
        failed_login_count=0,
        locked_until=None,
        email_verified=False,
        metadata_payload={},
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


def test_access_token_contains_access_type() -> None:
    user_id = uuid4()
    token = create_access_token(user_id)
    payload = decode_token(token)
    assert payload["type"] == TokenType.ACCESS
    assert payload["sub"] == str(user_id)


def test_refresh_token_type_validation() -> None:
    user_id = uuid4()
    refresh_token = create_refresh_token(user_id)
    payload = decode_token(refresh_token)
    ensure_token_type(payload, TokenType.REFRESH)
    with pytest.raises(JWTError):
        ensure_token_type(payload, TokenType.ACCESS)


def test_refresh_token_has_jti() -> None:
    user_id = uuid4()
    refresh_token = create_refresh_token(user_id)
    payload = decode_token(refresh_token)
    assert isinstance(payload.get("jti"), str)


def test_access_token_can_include_session_id() -> None:
    user_id = uuid4()
    session_id = uuid4()
    token = create_access_token(user_id, session_id=session_id)
    payload = decode_token(token)
    assert payload["sid"] == str(session_id)


@pytest.mark.asyncio
async def test_refresh_token_rotation(db_session) -> None:
    user = await _create_user(db_session, "rotate@example.com")

    refresh_token_1 = create_refresh_token(user.id)
    payload_1 = decode_token(refresh_token_1)
    jti_1 = payload_1["jti"]

    response = await refresh(_make_request(), RefreshRequest(refresh_token=refresh_token_1), db_session)
    refresh_token_2 = response.refresh_token
    payload_2 = decode_token(refresh_token_2)

    assert payload_2["jti"] != jti_1

    revoked = await db_session.execute(
        select(RevokedToken).where(RevokedToken.refresh_token_jti == jti_1)
    )
    assert revoked.scalar_one_or_none() is not None

    sessions = await db_session.execute(select(UserSession).where(UserSession.user_id == user.id))
    session_rows = sessions.scalars().all()
    assert len(session_rows) == 1
    assert str(session_rows[0].id) == payload_2["sid"]

    with pytest.raises(HTTPException) as exc_info:
        await refresh(_make_request(), RefreshRequest(refresh_token=refresh_token_1), db_session)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_revoke_endpoint(db_session) -> None:
    user = await _create_user(db_session, "revoke@example.com")

    refresh_token = create_refresh_token(user.id)
    payload = decode_token(refresh_token)

    result = await revoke(RefreshRequest(refresh_token=refresh_token), db_session)
    assert result.message == "Token revoked"

    revoked_token = await db_session.execute(
        select(RevokedToken).where(RevokedToken.refresh_token_jti == payload["jti"])
    )
    assert revoked_token.scalar_one_or_none() is not None

    with pytest.raises(HTTPException) as exc_info:
        await refresh(_make_request(), RefreshRequest(refresh_token=refresh_token), db_session)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_concurrent_refresh_reuse_detection(db_session) -> None:
    user = await _create_user(db_session, "concurrent@example.com")

    refresh_token = create_refresh_token(user.id)
    response_1 = await refresh(_make_request(), RefreshRequest(refresh_token=refresh_token), db_session)
    assert response_1.refresh_token

    with pytest.raises(HTTPException) as exc_info:
        await refresh(_make_request(), RefreshRequest(refresh_token=refresh_token), db_session)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_login_creates_session_and_list_endpoint_marks_current(real_auth_client, db_session) -> None:
    user = await _create_user(db_session, "login-session@example.com", password="TestPass123!")

    login_response = await real_auth_client.post(
        "/auth/login",
        json={"email": user.email, "password": "TestPass123!"},
        headers={"user-agent": "pytest-suite"},
    )
    assert login_response.status_code == 200
    tokens = login_response.json()

    sessions_response = await real_auth_client.get(
        "/auth/sessions",
        headers={
            "Authorization": f"Bearer {tokens['access_token']}",
            "user-agent": "pytest-suite",
        },
    )
    assert sessions_response.status_code == 200
    sessions = sessions_response.json()
    assert len(sessions) == 1
    assert sessions[0]["is_current"] is True
    assert sessions[0]["user_agent"] == "pytest-suite"


@pytest.mark.asyncio
async def test_revoke_session_blocks_access_and_refresh(real_auth_client, db_session) -> None:
    user = await _create_user(db_session, "multi-session@example.com", password="TestPass123!")

    first_login = await real_auth_client.post(
        "/auth/login",
        json={"email": user.email, "password": "TestPass123!"},
        headers={"user-agent": "session-a"},
    )
    second_login = await real_auth_client.post(
        "/auth/login",
        json={"email": user.email, "password": "TestPass123!"},
        headers={"user-agent": "session-b"},
    )
    tokens_a = first_login.json()
    tokens_b = second_login.json()

    sessions_response = await real_auth_client.get(
        "/auth/sessions",
        headers={"Authorization": f"Bearer {tokens_a['access_token']}", "user-agent": "session-a"},
    )
    sessions = sessions_response.json()
    target = next(session for session in sessions if session["is_current"] is False)

    revoke_response = await real_auth_client.delete(
        f"/auth/sessions/{target['id']}",
        headers={"Authorization": f"Bearer {tokens_a['access_token']}", "user-agent": "session-a"},
    )
    assert revoke_response.status_code == 200

    me_response = await real_auth_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {tokens_b['access_token']}", "user-agent": "session-b"},
    )
    assert me_response.status_code == 401

    refresh_response = await real_auth_client.post(
        "/auth/refresh",
        json={"refresh_token": tokens_b["refresh_token"]},
        headers={"user-agent": "session-b"},
    )
    assert refresh_response.status_code == 401
