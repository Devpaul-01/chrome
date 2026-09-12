from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import func, select

from app.db.models import NotificationOutbox
from app.services.notification_providers import NotificationDeliveryError
from app.services.notifications import (
    process_notification_batch,
    recover_stale_processing_notifications,
    requeue_failed_notification,
)


def _row(user, *, status="PENDING", attempts=0, max_attempts=2):
    now = datetime.now(timezone.utc)
    return NotificationOutbox(
        id=uuid.uuid4(),
        user_id=user.id,
        entitlement_id=None,
        source_transaction_id=None,
        notification_type="subscription_activated",
        channel="email",
        recipient=str(user.email),
        subject="Test",
        body_text="Test",
        body_html="<p>Test</p>",
        idempotency_key=f"hardening:{uuid.uuid4().hex}",
        status=status,
        attempts=attempts,
        max_attempts=max_attempts,
        scheduled_for=now - timedelta(seconds=1),
        next_attempt_at=now - timedelta(seconds=1),
        metadata_payload={},
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_provider_failure_is_sanitized_and_dead_lettered(db_session, test_user, monkeypatch):
    row = _row(test_user, max_attempts=1)
    db_session.add(row)
    await db_session.commit()

    async def fail(_row):
        raise RuntimeError("Bearer super-secret-token recipient@example.com")

    monkeypatch.setattr("app.services.notifications.deliver_notification", fail)
    result = await process_notification_batch(db=db_session)
    await db_session.refresh(row)

    assert result["failed"] == 1
    assert row.status == "FAILED"
    assert row.dead_lettered_at is not None
    assert row.last_error == "Notification delivery failed."
    assert row.last_error_code == "notification_delivery_error"
    assert "super-secret" not in row.last_error
    assert "recipient@example.com" not in row.last_error
    assert row.delivery_attempt_id
    assert row.last_delivery_latency_ms is not None


@pytest.mark.asyncio
async def test_nonretryable_provider_failure_dead_letters_immediately(db_session, test_user, monkeypatch):
    row = _row(test_user, max_attempts=5)
    db_session.add(row)
    await db_session.commit()

    async def fail(_row):
        raise NotificationDeliveryError("provider_rejected_delivery", retryable=False)

    monkeypatch.setattr("app.services.notifications.deliver_notification", fail)
    await process_notification_batch(db=db_session)
    await db_session.refresh(row)
    assert row.status == "FAILED"
    assert row.attempts == 1
    assert row.last_error_code == "provider_rejected_delivery"


@pytest.mark.asyncio
async def test_dead_letter_can_be_requeued_without_duplicate_row(db_session, test_user):
    row = _row(test_user, status="FAILED", attempts=2, max_attempts=2)
    row.dead_lettered_at = datetime.now(timezone.utc)
    row.last_error = "Notification delivery failed."
    row.last_error_code = "provider_delivery_failed"
    db_session.add(row)
    await db_session.commit()

    recovered = await requeue_failed_notification(
        db=db_session,
        notification_id=row.id,
        actor="acceptance-test",
    )
    assert recovered.id == row.id
    assert recovered.status == "RETRY"
    assert recovered.attempts == 0
    assert recovered.requeue_count == 1
    assert recovered.dead_lettered_at is None
    assert recovered.last_requeued_at is not None
    count = await db_session.scalar(select(func.count()).select_from(NotificationOutbox).where(NotificationOutbox.id == row.id))
    assert count == 1


@pytest.mark.asyncio
async def test_expired_claim_lease_is_recovered(db_session, test_user):
    now = datetime.now(timezone.utc)
    row = _row(test_user, status="PROCESSING")
    row.claim_expires_at = now - timedelta(seconds=1)
    row.updated_at = now
    db_session.add(row)
    await db_session.commit()

    recovered = await recover_stale_processing_notifications(db=db_session, now=now)
    await db_session.refresh(row)
    assert recovered == 1
    assert row.status == "RETRY"
    assert row.claim_expires_at is None
    assert row.last_error_code == "stale_processing_recovered"
