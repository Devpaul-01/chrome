"""Durable subscription/access notification lifecycle.

The service uses a transactional outbox:
- notification intent is persisted in the same transaction as billing/access truth;
- delivery is retried independently, so email outages cannot undo a payment;
- idempotency keys prevent duplicate logical notifications;
- scheduled reminders are cancelled when a renewal extends the coverage boundary;
- workers claim rows with FOR UPDATE SKIP LOCKED on PostgreSQL.

Delivery is intentionally at-least-once at the provider boundary. A process crash
after SendGrid accepts a message but before the database marks it SENT can cause a
rare duplicate delivery. The outbox prevents all normal duplicate scheduling and
worker races; true exactly-once email delivery requires provider-side idempotency,
which SendGrid does not provide for this API.
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterable
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import AccessEntitlement, NotificationOutbox, PaymentTransaction, User
from app.services.notification_providers import DeliveryResult, get_notification_provider
from app.services.notification_templates import render_subscription_email
from app.services.payment_plans import get_payment_plan
from app.services.notification_security import classify_delivery_failure

logger = logging.getLogger(__name__)

REMINDER_DAYS = (30, 7, 1)
PROCESSING_STALE_AFTER = timedelta(minutes=15)
SAFE_CANCEL_REASON = "superseded_or_not_applicable"
SAFE_STALE_RECOVERY_REASON = "recovered_stale_processing_claim"
LIFECYCLE_TYPES = frozenset(
    {
        "subscription_reminder_30d",
        "subscription_reminder_7d",
        "subscription_reminder_1d",
        "subscription_expired",
    }
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _coverage_token(value: datetime) -> str:
    return as_utc(value).isoformat()


async def _effective_coverage_end(
    db: AsyncSession,
    *,
    user_id,
    plan_code: str,
) -> datetime | None:
    result = await db.execute(
        select(AccessEntitlement.expires_at)
        .where(
            AccessEntitlement.user_id == user_id,
            AccessEntitlement.plan_code == plan_code,
            AccessEntitlement.status == "ACTIVE",
        )
        .order_by(AccessEntitlement.expires_at.desc())
        .limit(1)
    )
    value = result.scalar_one_or_none()
    return as_utc(value) if value is not None else None


async def _enqueue(
    *,
    db: AsyncSession,
    user: User,
    notification_type: str,
    subject: str,
    body_html: str,
    idempotency_key: str,
    scheduled_for: datetime,
    body_text: str = "",
    entitlement: AccessEntitlement | None = None,
    transaction: PaymentTransaction | None = None,
    metadata: dict | None = None,
) -> NotificationOutbox:
    """Atomically converge concurrent logical inserts on one outbox row.

    PostgreSQL ON CONFLICT avoids the transaction-abort race produced by
    catching a uniqueness violation after flush().
    """
    import uuid

    due = as_utc(scheduled_for)
    now = utcnow()
    candidate_id = uuid.uuid4()

    stmt = (
        pg_insert(NotificationOutbox)
        .values(
            id=candidate_id,
            user_id=user.id,
            entitlement_id=entitlement.id if entitlement is not None else None,
            source_transaction_id=transaction.id if transaction is not None else None,
            notification_type=notification_type,
            channel="email",
            recipient=str(user.email),
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            idempotency_key=idempotency_key,
            status="PENDING",
            attempts=0,
            max_attempts=settings.notification_max_attempts,
            # Explicit because the SQLite test harness intentionally strips
            # server_default expressions before create_all(), and this Core
            # INSERT does not run ORM before_insert listeners.
            requeue_count=0,
            scheduled_for=due,
            next_attempt_at=due,
            metadata_payload=dict(metadata or {}),
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=[NotificationOutbox.idempotency_key])
        .returning(NotificationOutbox.id)
    )

    actual_id = (await db.execute(stmt)).scalar_one_or_none()
    if actual_id is None:
        actual_id = await db.scalar(
            select(NotificationOutbox.id).where(
                NotificationOutbox.idempotency_key == idempotency_key
            )
        )
    if actual_id is None:
        raise RuntimeError(
            f"Unable to resolve notification idempotency key {idempotency_key!r}"
        )

    row = await db.get(NotificationOutbox, actual_id)
    if row is None:
        raise RuntimeError(f"Notification row {actual_id} disappeared after enqueue.")
    return row


async def cancel_obsolete_lifecycle_notifications(
    *,
    db: AsyncSession,
    user_id,
    plan_code: str,
    effective_coverage_end: datetime,
) -> int:
    """Cancel unsent reminders/expiry notices for an older coverage boundary."""
    token = _coverage_token(effective_coverage_end)
    result = await db.execute(
        select(NotificationOutbox).where(
            NotificationOutbox.user_id == user_id,
            NotificationOutbox.notification_type.in_(tuple(LIFECYCLE_TYPES)),
            NotificationOutbox.status.in_(("PENDING", "RETRY")),
        )
    )
    cancelled = 0
    now = utcnow()
    for row in result.scalars().all():
        metadata = dict(row.metadata_payload or {})
        if metadata.get("plan_code") != plan_code:
            continue
        if metadata.get("coverage_expires_at") == token:
            continue
        row.status = "CANCELLED"
        row.cancelled_at = now
        row.updated_at = now
        row.last_error = "superseded_by_renewal"
        cancelled += 1
    return cancelled


async def enqueue_payment_lifecycle_notifications(
    *,
    db: AsyncSession,
    user: User,
    transaction: PaymentTransaction,
    entitlement: AccessEntitlement,
    now: datetime | None = None,
) -> list[NotificationOutbox]:
    """Persist confirmation + reminder + expiration intents.

    Flushes but does not commit. The caller owns the surrounding billing transaction.
    """
    current = as_utc(now) if now is not None else utcnow()
    starts_at = as_utc(entitlement.starts_at)
    expires_at = as_utc(entitlement.expires_at)

    # A future start means this payment extended existing access.
    is_renewal = starts_at > current + timedelta(seconds=5)
    confirmation_type = "subscription_renewed" if is_renewal else "subscription_activated"
    try:
        plan_name = get_payment_plan(entitlement.plan_code).display_name
    except Exception:
        # Historical/custom plan codes should not block a paid entitlement.
        plan_name = entitlement.plan_code
    rendered = render_subscription_email(
        notification_type=confirmation_type,
        recipient_email=str(user.email),
        plan_name=plan_name,
        amount=f"{transaction.amount:.2f}" if transaction.amount is not None else None,
        currency=str(transaction.currency).upper() if transaction.currency else None,
        starts_at=starts_at,
        expires_at=expires_at,
        account_url=settings.account_url,
        support_email=settings.support_email,
    )
    created: list[NotificationOutbox] = [
        await _enqueue(
            db=db,
            user=user,
            entitlement=entitlement,
            transaction=transaction,
            notification_type=confirmation_type,
            subject=rendered.subject,
            body_text=rendered.text,
            body_html=rendered.html,
            idempotency_key=(
                f"payment:{transaction.provider}:{transaction.provider_payment_id}:"
                f"{confirmation_type}"
            ),
            scheduled_for=current,
            metadata={
                "plan_code": entitlement.plan_code,
                "coverage_starts_at": starts_at.isoformat(),
                "coverage_expires_at": expires_at.isoformat(),
            },
        )
    ]

    # The authoritative reminder boundary is the furthest ACTIVE expiration for
    # this user+plan. This automatically preserves prepaid time on early renewal.
    effective_end = await _effective_coverage_end(
        db, user_id=user.id, plan_code=entitlement.plan_code
    )
    if effective_end is None:
        effective_end = expires_at

    await cancel_obsolete_lifecycle_notifications(
        db=db,
        user_id=user.id,
        plan_code=entitlement.plan_code,
        effective_coverage_end=effective_end,
    )

    coverage_token = _coverage_token(effective_end)
    for days in REMINDER_DAYS:
        scheduled = effective_end - timedelta(days=days)
        # Never manufacture a "30 day reminder" after that point has passed.
        if scheduled <= current:
            continue
        kind = f"subscription_reminder_{days}d"
        reminder = render_subscription_email(
            notification_type=kind,
            recipient_email=str(user.email),
            plan_name=plan_name,
            amount=None,
            currency=None,
            starts_at=starts_at,
            expires_at=effective_end,
            account_url=settings.account_url,
            support_email=settings.support_email,
        )
        created.append(
            await _enqueue(
                db=db,
                user=user,
                entitlement=entitlement,
                notification_type=kind,
                subject=reminder.subject,
                body_text=reminder.text,
                body_html=reminder.html,
                idempotency_key=(
                    f"user:{user.id}:plan:{entitlement.plan_code}:coverage:{coverage_token}:"
                    f"reminder:{days}d"
                ),
                scheduled_for=scheduled,
                metadata={
                    "plan_code": entitlement.plan_code,
                    "coverage_expires_at": coverage_token,
                    "reminder_days": days,
                },
            )
        )

    expired = render_subscription_email(
        notification_type="subscription_expired",
        recipient_email=str(user.email),
        plan_name=plan_name,
        amount=None,
        currency=None,
        starts_at=starts_at,
        expires_at=effective_end,
        account_url=settings.account_url,
        support_email=settings.support_email,
    )
    created.append(
        await _enqueue(
            db=db,
            user=user,
            entitlement=entitlement,
            notification_type="subscription_expired",
            subject=expired.subject,
            body_text=expired.text,
            body_html=expired.html,
            idempotency_key=(
                f"user:{user.id}:plan:{entitlement.plan_code}:coverage:{coverage_token}:expired"
            ),
            scheduled_for=effective_end,
            metadata={
                "plan_code": entitlement.plan_code,
                "coverage_expires_at": coverage_token,
            },
        )
    )
    return created


async def _notification_is_still_applicable(
    db: AsyncSession, row: NotificationOutbox
) -> bool:
    if row.notification_type not in LIFECYCLE_TYPES:
        return True
    metadata = dict(row.metadata_payload or {})
    plan_code = metadata.get("plan_code")
    expected = metadata.get("coverage_expires_at")
    if not plan_code or not expected:
        return False
    current_end = await _effective_coverage_end(
        db, user_id=row.user_id, plan_code=plan_code
    )
    if current_end is None:
        # No active coverage remains; an expiration notice is still meaningful,
        # but reminders are not.
        return row.notification_type == "subscription_expired"
    return _coverage_token(current_end) == expected


async def deliver_notification(row: NotificationOutbox) -> DeliveryResult:
    """Deliver through the configured provider without exposing provider secrets."""
    if row.channel != "email":
        raise ValueError("unsupported_notification_channel")
    provider = get_notification_provider()
    return await provider.deliver_email(
        recipient=row.recipient,
        subject=row.subject,
        body_text=row.body_text,
        body_html=row.body_html,
    )


async def recover_stale_processing_notifications(
    *,
    db: AsyncSession,
    now: datetime | None = None,
    stale_after: timedelta = PROCESSING_STALE_AFTER,
) -> int:
    """Return abandoned PROCESSING rows to RETRY after their lease expires."""
    current = as_utc(now) if now is not None else utcnow()
    cutoff = current - stale_after

    result = await db.execute(
        select(NotificationOutbox)
        .where(
            NotificationOutbox.status == "PROCESSING",
            NotificationOutbox.attempts < NotificationOutbox.max_attempts,
            (
                (NotificationOutbox.claim_expires_at.is_not(None))
                & (NotificationOutbox.claim_expires_at <= current)
            )
            | (
                (NotificationOutbox.claim_expires_at.is_(None))
                & (NotificationOutbox.updated_at <= cutoff)
            ),
        )
        .order_by(NotificationOutbox.updated_at)
        .with_for_update(skip_locked=True)
    )
    rows = list(result.scalars().all())
    for row in rows:
        row.status = "RETRY"
        row.next_attempt_at = current
        row.updated_at = current
        row.claim_expires_at = None
        row.last_error = SAFE_STALE_RECOVERY_REASON
        row.last_error_code = "stale_processing_recovered"

    if rows:
        await db.commit()
    return len(rows)


async def requeue_failed_notification(
    *,
    db: AsyncSession,
    notification_id,
    actor: str = "operator",
    now: datetime | None = None,
) -> NotificationOutbox:
    """Controlled recovery for a terminal FAILED/dead-letter notification.

    Only FAILED rows can be requeued.  The logical notification/idempotency key is
    retained, so requeue cannot manufacture a duplicate outbox record.
    """
    current = as_utc(now) if now is not None else utcnow()
    result = await db.execute(
        select(NotificationOutbox)
        .where(NotificationOutbox.id == notification_id)
        .with_for_update()
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise ValueError("notification_not_found")
    if row.status != "FAILED":
        raise ValueError("notification_not_dead_lettered")

    metadata = dict(row.metadata_payload or {})
    history = list(metadata.get("requeue_history") or [])
    history.append(
        {
            "at": current.isoformat(),
            "actor": str(actor)[:128],
            "previous_attempts": row.attempts,
            "previous_error_code": row.last_error_code,
        }
    )
    metadata["requeue_history"] = history[-20:]

    row.status = "RETRY"
    row.attempts = 0
    row.next_attempt_at = current
    row.claim_expires_at = None
    row.dead_lettered_at = None
    row.last_requeued_at = current
    row.requeue_count += 1
    row.last_error = None
    row.last_error_code = None
    row.metadata_payload = metadata
    row.updated_at = current
    await db.commit()
    return row


def _log_delivery_event(level: int, event: str, row: NotificationOutbox, **fields) -> None:
    """Emit structured, payload-free diagnostic context."""
    extra = {
        "event": event,
        "notification_id": str(row.id),
        "notification_type": row.notification_type,
        "channel": row.channel,
        "attempt": row.attempts,
        "max_attempts": row.max_attempts,
        "delivery_attempt_id": row.delivery_attempt_id,
        **fields,
    }
    logger.log(level, event, extra=extra)


async def process_notification_batch(
    *,
    db: AsyncSession,
    limit: int = 50,
    now: datetime | None = None,
) -> dict[str, int]:
    """Claim and deliver a bounded batch with leases and privacy-safe diagnostics."""
    current = as_utc(now) if now is not None else utcnow()
    lease = timedelta(seconds=settings.notification_processing_lease_seconds)

    recovered = await recover_stale_processing_notifications(
        db=db,
        now=current,
        stale_after=lease,
    )

    result = await db.execute(
        select(NotificationOutbox)
        .where(
            NotificationOutbox.status.in_(("PENDING", "RETRY")),
            NotificationOutbox.scheduled_for <= current,
            NotificationOutbox.next_attempt_at <= current,
            NotificationOutbox.attempts < NotificationOutbox.max_attempts,
        )
        .order_by(NotificationOutbox.scheduled_for, NotificationOutbox.created_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    rows = list(result.scalars().all())

    for row in rows:
        row.status = "PROCESSING"
        row.updated_at = current
        row.claim_expires_at = current + lease
    await db.commit()

    sent = failed = cancelled = retried = 0
    for claimed_row in rows:
        row = await db.get(NotificationOutbox, claimed_row.id)
        if row is None or row.status != "PROCESSING":
            continue

        if not await _notification_is_still_applicable(db, row):
            event_now = utcnow()
            row.status = "CANCELLED"
            row.cancelled_at = event_now
            row.updated_at = event_now
            row.claim_expires_at = None
            row.last_error = SAFE_CANCEL_REASON
            row.last_error_code = "notification_not_applicable"
            cancelled += 1
            await db.commit()
            _log_delivery_event(logging.INFO, "notification_cancelled", row)
            continue

        row.attempts += 1
        attempt_started = time.perf_counter()
        event_now = utcnow()
        row.last_attempt_at = event_now
        row.updated_at = event_now
        row.delivery_attempt_id = str(uuid.uuid4())
        await db.commit()

        try:
            delivery = await deliver_notification(row)
            # Backward-compatible with existing tests/patches that return a string.
            if isinstance(delivery, DeliveryResult):
                row.provider_message_id = delivery.message_id
                provider = delivery.provider
            else:
                row.provider_message_id = str(delivery) if delivery else None
                provider = settings.notification_provider
            row.status = "SENT"
            row.sent_at = utcnow()
            row.last_error = None
            row.last_error_code = None
            row.claim_expires_at = None
            sent += 1
            latency_ms = max(0, int((time.perf_counter() - attempt_started) * 1000))
            row.last_delivery_latency_ms = latency_ms
            await db.commit()
            _log_delivery_event(
                logging.INFO,
                "notification_sent",
                row,
                provider=provider,
                latency_ms=latency_ms,
                provider_message_id=row.provider_message_id,
            )
            continue
        except Exception as exc:
            safe = classify_delivery_failure(exc)
            row.last_error = safe.detail
            row.last_error_code = safe.code
            row.claim_expires_at = None
            latency_ms = max(0, int((time.perf_counter() - attempt_started) * 1000))
            row.last_delivery_latency_ms = latency_ms

            terminal = (not safe.retryable) or row.attempts >= row.max_attempts
            if terminal:
                row.status = "FAILED"
                row.dead_lettered_at = utcnow()
                failed += 1
            else:
                row.status = "RETRY"
                backoff_minutes = min(60, 2 ** (row.attempts - 1))
                row.next_attempt_at = utcnow() + timedelta(minutes=backoff_minutes)
                retried += 1

            await db.commit()
            _log_delivery_event(
                logging.WARNING,
                "notification_delivery_failed",
                row,
                error_code=safe.code,
                exception_type=safe.exception_type,
                retryable=safe.retryable,
                terminal=terminal,
                latency_ms=latency_ms,
            )

    return {
        "recovered": recovered,
        "claimed": len(rows),
        "sent": sent,
        "retried": retried,
        "failed": failed,
        "cancelled": cancelled,
    }
