"""
test_subscription.py — Tests for subscription management endpoints.

Covers:
  - GET  /subscription/status          (no sub, active, grace period, canceled)
  - POST /subscription/cancel          (happy path, no active sub)
  - POST /subscription/reactivate      (happy path, not pending cancel)
  - POST /subscription/change-plan     (upgrade, already on plan)
  - POST /subscription/billing-portal  (happy path, no customer)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import SubscriptionRecord, User
from app.core.config import settings


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

async def _create_subscription(
    db: AsyncSession,
    user: User,
    *,
    status: str = "ACTIVE",
    price_id: str | None = None,
    cancel_at_period_end: bool = False,
    current_period_end: datetime | None = None,
) -> SubscriptionRecord:
    """Insert a SubscriptionRecord and return it."""
    now = datetime.now(timezone.utc)
    record = SubscriptionRecord(
        id=uuid.uuid4(),
        user_id=user.id,
        status=status,
        price_id=price_id or settings.stripe_price_monthly,
        stripe_subscription_id=f"sub_{uuid.uuid4().hex[:12]}",
        stripe_customer_id=user.stripe_customer_id or f"cus_{uuid.uuid4().hex[:12]}",
        current_period_start=now - timedelta(days=15),
        current_period_end=current_period_end or (now + timedelta(days=15)),
        cancel_at_period_end=cancel_at_period_end,
        started_at=now - timedelta(days=30),
        created_at=now,
        updated_at=now,
        metadata_payload={},
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# ---------------------------------------------------------------------------
# GET /subscription/status
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_status_no_subscription(async_client: AsyncClient):
    resp = await async_client.get("/subscription/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_active"] is False
    assert body["plan"] is None
    assert body["status"] is None
    assert body["in_grace_period"] is False


@pytest.mark.asyncio
async def test_status_active_subscription(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    await _create_subscription(db_session, test_user)
    resp = await async_client.get("/subscription/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_active"] is True
    assert body["plan"] == "monthly"
    assert body["status"] == "ACTIVE"
    assert body["cancel_at_period_end"] is False
    assert body["in_grace_period"] is False


@pytest.mark.asyncio
async def test_status_grace_period(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    """PAST_DUE with current_period_end in the future → grace period."""
    future = datetime.now(timezone.utc) + timedelta(days=5)
    await _create_subscription(
        db_session, test_user, status="PAST_DUE", current_period_end=future,
    )
    resp = await async_client.get("/subscription/status")
    body = resp.json()
    assert body["is_active"] is True
    assert body["in_grace_period"] is True
    assert body["status"] == "PAST_DUE"


@pytest.mark.asyncio
async def test_status_past_due_expired(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    """PAST_DUE with current_period_end in the past → no longer active."""
    past = datetime.now(timezone.utc) - timedelta(days=5)
    await _create_subscription(
        db_session, test_user, status="PAST_DUE", current_period_end=past,
    )
    resp = await async_client.get("/subscription/status")
    body = resp.json()
    assert body["is_active"] is False
    assert body["in_grace_period"] is False


# ---------------------------------------------------------------------------
# POST /subscription/cancel
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancel_success(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    record = await _create_subscription(db_session, test_user)  # noqa: F841
    with patch(
        "app.api.routers.subscription.cancel_subscription",
        new_callable=AsyncMock,
        return_value={"cancel_at_period_end": True},
    ):
        resp = await async_client.post("/subscription/cancel")
    assert resp.status_code == 200
    body = resp.json()
    assert body["cancel_at_period_end"] is True
    assert "end of the current billing period" in body["message"]


@pytest.mark.asyncio
async def test_cancel_no_active_sub(async_client: AsyncClient):
    resp = await async_client.post("/subscription/cancel")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /subscription/reactivate
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reactivate_success(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    await _create_subscription(db_session, test_user, cancel_at_period_end=True)
    with patch(
        "app.api.routers.subscription.reactivate_subscription",
        new_callable=AsyncMock,
        return_value={"cancel_at_period_end": False},
    ):
        resp = await async_client.post("/subscription/reactivate")
    assert resp.status_code == 200
    body = resp.json()
    assert body["cancel_at_period_end"] is False
    assert "reactivated" in body["message"].lower()


@pytest.mark.asyncio
async def test_reactivate_not_pending(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    await _create_subscription(db_session, test_user, cancel_at_period_end=False)
    resp = await async_client.post("/subscription/reactivate")
    assert resp.status_code == 400
    assert "not pending" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /subscription/change-plan
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_change_plan_upgrade(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    await _create_subscription(
        db_session, test_user, price_id=settings.stripe_price_monthly,
    )
    with patch(
        "app.api.routers.subscription.change_subscription_plan",
        new_callable=AsyncMock,
        return_value={"status": "active"},
    ):
        resp = await async_client.post(
            "/subscription/change-plan", json={"new_plan": "yearly"}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["new_plan"] == "yearly"
    assert "proration" in body["message"].lower()


@pytest.mark.asyncio
async def test_change_plan_same_plan(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    await _create_subscription(
        db_session, test_user, price_id=settings.stripe_price_monthly,
    )
    resp = await async_client.post(
        "/subscription/change-plan", json={"new_plan": "monthly"}
    )
    assert resp.status_code == 400
    assert "already on" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_change_plan_no_active_sub(async_client: AsyncClient):
    resp = await async_client.post(
        "/subscription/change-plan", json={"new_plan": "yearly"}
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /subscription/billing-portal
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_billing_portal_success(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    test_user.stripe_customer_id = "cus_test123"
    await db_session.commit()
    with patch(
        "app.api.routers.subscription.create_billing_portal_session",
        new_callable=AsyncMock,
        return_value="https://billing.stripe.com/session/test",
    ):
        resp = await async_client.post("/subscription/billing-portal")
    assert resp.status_code == 200
    assert resp.json()["portal_url"].startswith("https://")


@pytest.mark.asyncio
async def test_billing_portal_no_customer(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    test_user.stripe_customer_id = None
    await db_session.commit()
    resp = await async_client.post("/subscription/billing-portal")
    assert resp.status_code == 400
    assert "no billing account found" in resp.json()["detail"].lower()
