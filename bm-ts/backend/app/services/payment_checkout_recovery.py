"""Automatic recovery for stale or uncertain BTCPay checkout attempts.

Recovery is deliberately one-way and conservative: it NEVER creates a new
provider invoice. It can only discover an invoice by the checkout attempt's
deterministic provider_order_id and bind that existing invoice locally.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import os

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PaymentCheckoutAttempt
from app.services.btcpay import find_invoice_by_order_id
from app.services.payment_plans import get_payment_plan


logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def recover_stale_btcpay_checkouts(
    *,
    db: AsyncSession,
    now: datetime | None = None,
    limit: int | None = None,
) -> dict[str, int]:
    """Recover eligible checkout attempts using provider-order reconciliation.

    PostgreSQL workers use FOR UPDATE SKIP LOCKED so multiple recovery workers
    can operate without processing the same row concurrently.
    """
    from app.api.routers import payments as payment_router

    effective_now = now or _utcnow()
    batch_limit = limit or int(os.getenv("PAYMENT_CHECKOUT_RECOVERY_BATCH_SIZE", "50"))
    stale_seconds = int(os.getenv("PAYMENT_CHECKOUT_RECOVERY_STALE_SECONDS", "120"))
    stale_before = effective_now - timedelta(seconds=stale_seconds)

    stmt = (
        select(PaymentCheckoutAttempt)
        .where(
            PaymentCheckoutAttempt.provider == "btcpay",
            PaymentCheckoutAttempt.status.in_(("claimed", "uncertain")),
            or_(
                PaymentCheckoutAttempt.claim_expires_at.is_(None),
                PaymentCheckoutAttempt.claim_expires_at <= effective_now,
                PaymentCheckoutAttempt.updated_at <= stale_before,
            ),
        )
        .order_by(PaymentCheckoutAttempt.updated_at.asc())
        .limit(batch_limit)
        .with_for_update(skip_locked=True)
    )

    attempts = (await db.execute(stmt)).scalars().all()

    recovered = 0
    unresolved = 0
    already_finalized = 0
    failed = 0

    for attempt in attempts:
        try:
            existing = await payment_router._existing_checkout_transaction(db, attempt)
            if existing is not None:
                if attempt.status != "completed":
                    attempt.status = "completed"
                    attempt.completed_at = attempt.completed_at or effective_now
                    attempt.claim_expires_at = None
                    attempt.updated_at = effective_now
                already_finalized += 1
                await db.commit()
                continue

            invoice = await find_invoice_by_order_id(attempt.provider_order_id)
            if invoice is None:
                # Keep it recoverable. Do not fabricate or replace an invoice.
                attempt.status = "uncertain"
                attempt.claim_expires_at = effective_now + timedelta(seconds=stale_seconds)
                attempt.updated_at = effective_now
                unresolved += 1
                await db.commit()
                continue

            plan = get_payment_plan(attempt.plan_code)
            await payment_router._finalize_checkout(
                db=db,
                attempt=attempt,
                invoice=invoice,
                term_months=plan.term_months,
            )
            recovered += 1
            # _finalize_checkout owns its normal persistence semantics. Commit
            # defensively in case its implementation only flushes.
            await db.commit()

        except Exception:
            await db.rollback()
            failed += 1
            logger.exception(
                "btcpay_checkout_recovery_failed",
                extra={
                    "checkout_attempt_id": str(attempt.id),
                    "provider_order_id": attempt.provider_order_id,
                },
            )

    return {
        "scanned": len(attempts),
        "recovered": recovered,
        "unresolved": unresolved,
        "already_finalized": already_finalized,
        "failed": failed,
    }
