from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.db.models import AccessEntitlement, NotificationOutbox, PaymentTransaction
from app.services.notifications import (
    enqueue_payment_lifecycle_notifications,
    process_notification_batch,
    recover_stale_processing_notifications,
    _enqueue,
)


def _utc(value):
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def _payment_and_entitlement(db, user, *, starts_at=None, expires_at=None):
    now = datetime.now(timezone.utc)
    starts_at = starts_at or now
    expires_at = expires_at or (starts_at + timedelta(days=31))
    tx = PaymentTransaction(
        id=uuid.uuid4(),
        user_id=user.id,
        provider="btcpay",
        provider_payment_id=f"notify-invoice-{uuid.uuid4().hex}",
        provider_order_id=f"notify-order-{uuid.uuid4().hex}",
        amount=Decimal("1.00"),
        currency="USD",
        status="Settled",
        checkout_url="https://example.test/checkout",
        payment_method="bitcoin",
        plan_code="btcpay-integration-test",
        paid_at=now,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 1},
    )
    db.add(tx)
    await db.flush()
    ent = AccessEntitlement(
        id=uuid.uuid4(),
        user_id=user.id,
        plan_code=tx.plan_code,
        status="ACTIVE",
        starts_at=starts_at,
        expires_at=expires_at,
        source_provider="btcpay",
        source_payment_id=tx.provider_payment_id,
        source_transaction_id=tx.id,
        created_at=now,
        updated_at=now,
        metadata_payload={},
    )
    db.add(ent)
    await db.flush()
    return tx, ent


@pytest.mark.asyncio
async def test_lifecycle_enqueue_is_idempotent(db_session, test_user):
    now = datetime.now(timezone.utc)
    tx, ent = await _payment_and_entitlement(
        db_session,
        test_user,
        starts_at=now,
        expires_at=now + timedelta(days=40),
    )
    first = await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx, entitlement=ent, now=now
    )
    second = await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx, entitlement=ent, now=now
    )
    await db_session.commit()

    assert [row.id for row in first] == [row.id for row in second]
    keys = (
        await db_session.execute(select(NotificationOutbox.idempotency_key))
    ).scalars().all()
    assert len(keys) == len(set(keys))
    assert any(":reminder:30d" in key for key in keys)
    assert any(key.endswith(":expired") for key in keys)


@pytest.mark.asyncio
async def test_early_renewal_cancels_obsolete_unsent_reminders(db_session, test_user):
    now = datetime.now(timezone.utc)
    tx1, ent1 = await _payment_and_entitlement(
        db_session, test_user, starts_at=now, expires_at=now + timedelta(days=40)
    )
    await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx1, entitlement=ent1, now=now
    )
    await db_session.commit()

    old_expiry = _utc(ent1.expires_at)
    tx2, ent2 = await _payment_and_entitlement(
        db_session,
        test_user,
        starts_at=old_expiry,
        expires_at=old_expiry + timedelta(days=31),
    )
    await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx2, entitlement=ent2, now=now
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(NotificationOutbox).where(
                NotificationOutbox.notification_type.in_(
                    (
                        "subscription_reminder_30d",
                        "subscription_reminder_7d",
                        "subscription_reminder_1d",
                        "subscription_expired",
                    )
                )
            )
        )
    ).scalars().all()
    old_token = old_expiry.isoformat()
    obsolete = [
        r for r in rows
        if (r.metadata_payload or {}).get("coverage_expires_at") == old_token
    ]
    assert obsolete
    assert all(r.status == "CANCELLED" for r in obsolete)


@pytest.mark.asyncio
async def test_successful_delivery_is_never_selected_again(
    db_session, test_user, monkeypatch
):
    now = datetime.now(timezone.utc)
    tx, ent = await _payment_and_entitlement(
        db_session, test_user, starts_at=now, expires_at=now + timedelta(days=31)
    )
    rows = await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx, entitlement=ent, now=now
    )
    await db_session.commit()
    confirmation = next(r for r in rows if r.notification_type == "subscription_activated")

    calls = {"count": 0}
    async def fake_send(row):
        calls["count"] += 1
        return "sendgrid-message-id"

    monkeypatch.setattr("app.services.notifications.deliver_notification", fake_send)
    first = await process_notification_batch(db=db_session, now=now)
    second = await process_notification_batch(db=db_session, now=now)
    await db_session.refresh(confirmation)

    assert first["sent"] == 1
    assert second["sent"] == 0
    assert confirmation.status == "SENT"
    assert confirmation.attempts == 1
    assert calls["count"] == 1


@pytest.mark.asyncio
async def test_failure_retries_then_becomes_terminal_failed(
    db_session, test_user, monkeypatch
):
    now = datetime.now(timezone.utc)
    tx, ent = await _payment_and_entitlement(
        db_session, test_user, starts_at=now, expires_at=now + timedelta(days=31)
    )
    rows = await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx, entitlement=ent, now=now
    )
    confirmation = next(r for r in rows if r.notification_type == "subscription_activated")
    confirmation.max_attempts = 2
    await db_session.commit()

    async def always_fail(row):
        raise RuntimeError("email provider unavailable")

    monkeypatch.setattr("app.services.notifications.deliver_notification", always_fail)

    await process_notification_batch(db=db_session, now=now)
    await db_session.refresh(confirmation)
    assert confirmation.status == "RETRY"
    assert confirmation.attempts == 1

    confirmation.next_attempt_at = now - timedelta(seconds=1)
    await db_session.commit()
    await process_notification_batch(db=db_session, now=now)
    await db_session.refresh(confirmation)
    assert confirmation.status == "FAILED"
    assert confirmation.attempts == 2
    assert confirmation.last_error == "Notification delivery failed."
    assert confirmation.last_error_code == "notification_delivery_error"


@pytest.mark.asyncio
async def test_expiration_notice_is_cancelled_if_coverage_extended_before_send(
    db_session, test_user, monkeypatch
):
    now = datetime.now(timezone.utc)
    old_end = now + timedelta(minutes=1)
    tx1, ent1 = await _payment_and_entitlement(
        db_session, test_user, starts_at=now - timedelta(days=30), expires_at=old_end
    )
    old_rows = await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx1, entitlement=ent1, now=now
    )
    old_expiry = next(r for r in old_rows if r.notification_type == "subscription_expired")
    await db_session.commit()

    # Renewal extends the effective boundary before the old expiration worker fires.
    tx2, ent2 = await _payment_and_entitlement(
        db_session, test_user, starts_at=old_end, expires_at=old_end + timedelta(days=31)
    )
    await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx2, entitlement=ent2, now=now
    )
    await db_session.commit()
    await db_session.refresh(old_expiry)
    assert old_expiry.status == "CANCELLED"

@pytest.mark.asyncio
async def test_stale_processing_claim_is_recovered_and_retried(
    db_session, test_user, monkeypatch
):
    now = datetime.now(timezone.utc)
    tx, ent = await _payment_and_entitlement(
        db_session, test_user, starts_at=now, expires_at=now + timedelta(days=31)
    )
    rows = await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx, entitlement=ent, now=now
    )
    confirmation = next(
        r for r in rows if r.notification_type == "subscription_activated"
    )
    confirmation.status = "PROCESSING"
    confirmation.updated_at = now - timedelta(minutes=30)
    confirmation.next_attempt_at = now - timedelta(minutes=30)
    await db_session.commit()

    calls = {"count": 0}

    async def fake_send(row):
        calls["count"] += 1
        return "recovered-message-id"

    monkeypatch.setattr(
        "app.services.notifications.deliver_notification",
        fake_send,
    )

    result = await process_notification_batch(db=db_session, now=now)
    await db_session.refresh(confirmation)

    assert result["recovered"] == 1
    assert result["claimed"] == 1
    assert result["sent"] == 1
    assert confirmation.status == "SENT"
    assert confirmation.attempts == 1
    assert calls["count"] == 1


@pytest.mark.asyncio
async def test_fresh_processing_claim_is_not_stolen(db_session, test_user):
    now = datetime.now(timezone.utc)
    tx, ent = await _payment_and_entitlement(
        db_session, test_user, starts_at=now, expires_at=now + timedelta(days=31)
    )
    rows = await enqueue_payment_lifecycle_notifications(
        db=db_session, user=test_user, transaction=tx, entitlement=ent, now=now
    )
    confirmation = next(
        r for r in rows if r.notification_type == "subscription_activated"
    )
    confirmation.status = "PROCESSING"
    confirmation.updated_at = now - timedelta(minutes=1)
    await db_session.commit()

    recovered = await recover_stale_processing_notifications(
        db=db_session,
        now=now,
        stale_after=timedelta(minutes=15),
    )
    await db_session.refresh(confirmation)

    assert recovered == 0
    assert confirmation.status == "PROCESSING"


@pytest.mark.asyncio
async def test_enqueue_unique_key_race_converges_without_outer_rollback(
    db_session, test_user
):
    now = datetime.now(timezone.utc)
    key = f"unit-race:{uuid.uuid4().hex}"

    first = await _enqueue(
        db=db_session,
        user=test_user,
        notification_type="subscription_activated",
        subject="First",
        body_html="<p>First</p>",
        idempotency_key=key,
        scheduled_for=now,
    )
    second = await _enqueue(
        db=db_session,
        user=test_user,
        notification_type="subscription_activated",
        subject="Second",
        body_html="<p>Second</p>",
        idempotency_key=key,
        scheduled_for=now,
    )
    await db_session.commit()

    assert first.id == second.id
    count = await db_session.scalar(
        select(func.count(NotificationOutbox.id)).where(
            NotificationOutbox.idempotency_key == key
        )
    )
    assert count == 1
