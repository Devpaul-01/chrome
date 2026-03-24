"""
test_webhook.py — Tests for the Stripe webhook endpoint.

Covers all webhook event types:
  - customer.subscription.created   → creates SubscriptionRecord
  - customer.subscription.updated   → syncs changes (cancel, plan swap)
  - customer.subscription.deleted   → marks subscription CANCELED
  - invoice.payment_failed          → transitions subscription to PAST_DUE
  - Unhandled event type            → returns {"received": True}
  - Missing / invalid signature     → 400 error
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import SubscriptionRecord, User


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _build_event(event_type: str, object_data: dict[str, Any]) -> MagicMock:
    """Build a mock stripe.Event."""
    event = MagicMock()
    event.type = event_type
    event.data.object = object_data
    return event


def _subscription_object(
    *,
    sub_id: str = "sub_test_123",
    customer_id: str = "cus_test_456",
    status: str = "ACTIVE",
    price_id: str = "price_monthly_placeholder",
    cancel_at_period_end: bool = False,
) -> dict[str, Any]:
    """Return a dict that mimics a Stripe subscription object."""
    now_ts = int(datetime.now(timezone.utc).timestamp())
    return {
        "id": sub_id,
        "customer": customer_id,
        "status": status,
        "cancel_at_period_end": cancel_at_period_end,
        "canceled_at": None,
        "current_period_start": now_ts - 86400 * 15,
        "current_period_end": now_ts + 86400 * 15,
        "start_date": now_ts - 86400 * 30,
        "ended_at": None,
        "trial_end": None,
        "items": {"data": [{"price": {"id": price_id}}]},
        "metadata": {},
    }


async def _post_webhook(
    client: AsyncClient,
    event_type: str,
    object_data: dict[str, Any],
) -> Any:
    """POST to the webhook endpoint with a mocked construct_event."""
    event = _build_event(event_type, object_data)
    with patch(
        "app.api.routers.webhook.construct_event", return_value=event,
    ):
        return await client.post(
            "/stripe/webhook",
            content=json.dumps(object_data).encode(),
            headers={"stripe-signature": "t=123,v1=sig"},
        )


async def _create_subscription(
    db: AsyncSession,
    user: User,
    *,
    sub_id: str = "sub_test_123",
    status: str = "ACTIVE",
    price_id: str = "price_monthly_placeholder",
) -> SubscriptionRecord:
    now = datetime.now(timezone.utc)
    record = SubscriptionRecord(
        id=uuid.uuid4(),
        user_id=user.id,
        status=status,
        price_id=price_id,
        stripe_subscription_id=sub_id,
        stripe_customer_id=user.stripe_customer_id or "cus_test_456",
        current_period_start=now - timedelta(days=15),
        current_period_end=now + timedelta(days=15),
        cancel_at_period_end=False,
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
# signature validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_missing_signature(async_client: AsyncClient):
    resp = await async_client.post("/stripe/webhook", content=b"{}")
    assert resp.status_code == 400
    assert "signature" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_webhook_invalid_signature(async_client: AsyncClient):
    with patch(
        "app.api.routers.webhook.construct_event",
        side_effect=Exception("Invalid signature"),
    ):
        resp = await async_client.post(
            "/stripe/webhook",
            content=b"{}",
            headers={"stripe-signature": "bad"},
        )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# unhandled event
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_unhandled_event(async_client: AsyncClient):
    resp = await _post_webhook(
        async_client, "charge.succeeded", {"id": "ch_test"},
    )
    assert resp.status_code == 200
    assert resp.json()["received"] is True


# ---------------------------------------------------------------------------
# customer.subscription.created
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_subscription_created(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    test_user.stripe_customer_id = "cus_test_456"
    await db_session.commit()

    data = _subscription_object()
    resp = await _post_webhook(async_client, "customer.subscription.created", data)
    assert resp.status_code == 200

    result = await db_session.execute(
        select(SubscriptionRecord).where(
            SubscriptionRecord.stripe_subscription_id == "sub_test_123"
        )
    )
    record = result.scalar_one_or_none()
    assert record is not None
    assert record.status == "ACTIVE"
    assert record.user_id == test_user.id


# ---------------------------------------------------------------------------
# customer.subscription.updated (cancel_at_period_end)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_subscription_updated_cancel(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    test_user.stripe_customer_id = "cus_test_456"
    await db_session.commit()
    await _create_subscription(db_session, test_user)

    data = _subscription_object(cancel_at_period_end=True)
    resp = await _post_webhook(async_client, "customer.subscription.updated", data)
    assert resp.status_code == 200

    result = await db_session.execute(
        select(SubscriptionRecord).where(
            SubscriptionRecord.stripe_subscription_id == "sub_test_123"
        )
    )
    record = result.scalar_one()
    assert record.cancel_at_period_end is True


# ---------------------------------------------------------------------------
# customer.subscription.updated (plan change)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_subscription_updated_plan_change(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    test_user.stripe_customer_id = "cus_test_456"
    await db_session.commit()
    await _create_subscription(db_session, test_user, price_id="price_monthly_placeholder")

    data = _subscription_object(price_id="price_yearly_placeholder")
    resp = await _post_webhook(async_client, "customer.subscription.updated", data)
    assert resp.status_code == 200

    result = await db_session.execute(
        select(SubscriptionRecord).where(
            SubscriptionRecord.stripe_subscription_id == "sub_test_123"
        )
    )
    record = result.scalar_one()
    assert record.price_id == "price_yearly_placeholder"


# ---------------------------------------------------------------------------
# customer.subscription.deleted
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_subscription_deleted(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    test_user.stripe_customer_id = "cus_test_456"
    await db_session.commit()
    await _create_subscription(db_session, test_user)

    data = _subscription_object(status="CANCELED")
    now_ts = int(datetime.now(timezone.utc).timestamp())
    data["canceled_at"] = now_ts
    data["ended_at"] = now_ts

    resp = await _post_webhook(async_client, "customer.subscription.deleted", data)
    assert resp.status_code == 200

    result = await db_session.execute(
        select(SubscriptionRecord).where(
            SubscriptionRecord.stripe_subscription_id == "sub_test_123"
        )
    )
    record = result.scalar_one()
    assert record.status == "CANCELED"
    assert record.ended_at is not None


# ---------------------------------------------------------------------------
# invoice.payment_failed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_payment_failed(
    async_client: AsyncClient, db_session: AsyncSession, test_user: User
):
    """payment_failed should transition the subscription to PAST_DUE (grace period)."""
    test_user.stripe_customer_id = "cus_test_456"
    await db_session.commit()
    record = await _create_subscription(db_session, test_user)

    invoice_data = {
        "id": "in_test_789",
        "customer": "cus_test_456",
        "subscription": record.stripe_subscription_id,
        "status": "open",
    }

    resp = await _post_webhook(async_client, "invoice.payment_failed", invoice_data)
    assert resp.status_code == 200

    result = await db_session.execute(
        select(SubscriptionRecord).where(
            SubscriptionRecord.id == record.id
        )
    )
    updated = result.scalar_one()
    assert updated.status == "PAST_DUE"


@pytest.mark.asyncio
async def test_webhook_payment_failed_no_subscription(async_client: AsyncClient):
    """payment_failed with no subscription field should succeed silently."""
    invoice_data = {"id": "in_test_000", "customer": "cus_unknown", "status": "open"}
    resp = await _post_webhook(async_client, "invoice.payment_failed", invoice_data)
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# no matching user
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_unknown_customer(async_client: AsyncClient):
    """Subscription event for an unknown customer should succeed silently."""
    data = _subscription_object(customer_id="cus_nonexistent")
    resp = await _post_webhook(async_client, "customer.subscription.created", data)
    assert resp.status_code == 200
    assert resp.json()["received"] is True
