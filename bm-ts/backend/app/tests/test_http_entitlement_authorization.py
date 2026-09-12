"""End-to-end HTTP authorization tests for paid BirthdayMessaging features.

Important:
    These tests intentionally DO NOT use the shared ``async_client`` fixture for
    entitlement-state cases. The general application test fixture may provision
    paid access so legacy paid-feature tests can continue exercising their
    endpoints after global entitlement enforcement was introduced.

    This suite instead builds a narrowly-scoped ASGI client that overrides only:
      * get_db -> the current test database session
      * get_current_user -> the requested test user

    It does NOT override ``require_active_entitlement`` and does NOT create an
    entitlement unless the individual test explicitly does so. That makes these
    genuine runtime authorization-boundary tests.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AccessEntitlement, User


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _entitlement(
    user: User,
    *,
    starts_at: datetime,
    expires_at: datetime,
    entitlement_status: str = "ACTIVE",
    plan_code: str = "personal-monthly",
) -> AccessEntitlement:
    now = _utcnow()
    return AccessEntitlement(
        id=uuid.uuid4(),
        user_id=user.id,
        plan_code=plan_code,
        status=entitlement_status,
        starts_at=starts_at,
        expires_at=expires_at,
        source_provider="btcpay",
        source_payment_id=f"http-auth-{uuid.uuid4()}",
        source_transaction_id=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"test": "http-authorization"},
    )


def _assert_structured_error(response, *, status_code: int, code: str) -> dict:
    assert response.status_code == status_code, response.text
    body = response.json()
    assert body.get("code") == code, body
    assert isinstance(body.get("detail"), str) and body["detail"].strip(), body
    assert body.get("timestamp"), body
    assert "errors" in body, body
    return body


@asynccontextmanager
async def _authenticated_client(
    db_session: AsyncSession,
    user: User,
):
    """ASGI client with authentication/database overrides only.

    Do not add an entitlement here. The entire purpose of this helper is to let
    each test explicitly control entitlement state.
    """
    from app.main import app
    from app.db.session import get_db
    from app.api.deps import get_current_user

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        return user

    # Keep this test isolated from overrides installed by another fixture/test.
    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


@asynccontextmanager
async def _anonymous_client(db_session: AsyncSession):
    """ASGI client with the test DB, but the real authentication dependency."""
    from app.main import app
    from app.db.session import get_db

    async def override_get_db():
        yield db_session

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


@pytest.mark.asyncio
async def test_paid_endpoint_without_bearer_token_is_401(
    db_session: AsyncSession,
) -> None:
    async with _anonymous_client(db_session) as client:
        response = await client.post("/send-birthday-message", json={})

    assert response.status_code == 401, response.text
    body = response.json()
    assert body.get("code") in {"unauthorized", "invalid_credentials"}, body
    assert isinstance(body.get("detail"), str) and body["detail"].strip(), body
    assert body.get("timestamp"), body
    assert "errors" in body, body


@pytest.mark.asyncio
async def test_authenticated_user_without_entitlement_gets_subscription_required(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    async with _authenticated_client(db_session, test_user) as client:
        response = await client.post("/send-birthday-message", json={})

    _assert_structured_error(
        response,
        status_code=403,
        code="subscription_required",
    )


@pytest.mark.asyncio
async def test_expired_entitlement_is_rejected_over_http(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = _utcnow()
    db_session.add(
        _entitlement(
            test_user,
            starts_at=now - timedelta(days=31),
            expires_at=now - timedelta(seconds=1),
        )
    )
    await db_session.commit()

    async with _authenticated_client(db_session, test_user) as client:
        response = await client.post("/send-birthday-message", json={})

    _assert_structured_error(
        response,
        status_code=403,
        code="subscription_expired",
    )


@pytest.mark.asyncio
async def test_future_entitlement_is_not_usable_early_over_http(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = _utcnow()
    db_session.add(
        _entitlement(
            test_user,
            starts_at=now + timedelta(days=2),
            expires_at=now + timedelta(days=32),
        )
    )
    await db_session.commit()

    async with _authenticated_client(db_session, test_user) as client:
        response = await client.post("/send-birthday-message", json={})

    _assert_structured_error(
        response,
        status_code=403,
        code="subscription_not_yet_active",
    )


@pytest.mark.asyncio
async def test_revoked_entitlement_is_rejected_over_http(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = _utcnow()
    db_session.add(
        _entitlement(
            test_user,
            starts_at=now - timedelta(days=1),
            expires_at=now + timedelta(days=29),
            entitlement_status="REVOKED",
        )
    )
    await db_session.commit()

    async with _authenticated_client(db_session, test_user) as client:
        response = await client.post("/send-birthday-message", json={})

    _assert_structured_error(
        response,
        status_code=403,
        code="subscription_inactive",
    )


@pytest.mark.asyncio
async def test_active_entitlement_reaches_paid_endpoint(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """501 means authorization succeeded and execution reached the paid stub."""
    now = _utcnow()
    db_session.add(
        _entitlement(
            test_user,
            starts_at=now - timedelta(days=1),
            expires_at=now + timedelta(days=29),
        )
    )
    await db_session.commit()

    async with _authenticated_client(db_session, test_user) as client:
        response = await client.post("/send-birthday-message", json={})

    assert response.status_code == 501, response.text
    body = response.json()
    assert "not implemented" in str(body.get("detail", "")).lower(), body


@pytest.mark.asyncio
async def test_current_entitlement_plus_future_renewal_still_reaches_paid_endpoint(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = _utcnow()
    current = _entitlement(
        test_user,
        starts_at=now - timedelta(days=10),
        expires_at=now + timedelta(days=10),
    )
    future = _entitlement(
        test_user,
        starts_at=now + timedelta(days=10),
        expires_at=now + timedelta(days=40),
    )
    db_session.add_all([current, future])
    await db_session.commit()

    async with _authenticated_client(db_session, test_user) as client:
        response = await client.post("/send-birthday-message", json={})

    assert response.status_code == 501, response.text


@pytest.mark.asyncio
async def test_health_remains_outside_entitlement_boundary(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    # Use the same authenticated/no-entitlement client to prove /health is not
    # accidentally placed behind the paid-access boundary.
    async with _authenticated_client(db_session, test_user) as client:
        response = await client.get("/health")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("status") == "ok", body
