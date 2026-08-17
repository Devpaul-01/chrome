"""Provider-neutral access entitlement service.

A successful payment is not itself an authorization check.  This module turns
an already-authoritative, fully settled PaymentTransaction into a time-bounded
AccessEntitlement.  One entitlement row is retained per payment so billing and
access remain auditable.
"""

from __future__ import annotations

import calendar
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AccessEntitlement, PaymentTransaction, User


_ALLOWED_TERM_MONTHS = frozenset({1, 6, 12})


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    """Return a UTC-aware datetime.

    PostgreSQL returns timezone-aware values for TIMESTAMPTZ, but SQLite (used
    by the test suite) may return naive datetimes even when SQLAlchemy declares
    DateTime(timezone=True). Treat such stored timestamps as UTC so business
    logic behaves identically in tests and production.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _add_calendar_months(value: datetime, months: int) -> datetime:
    """Add whole calendar months without converting a month to a fixed day count."""
    month_index = (value.month - 1) + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _term_months(transaction: PaymentTransaction) -> int:
    """Read and validate the server-stored billing term for a payment."""
    metadata = dict(transaction.metadata_payload or {})
    raw = metadata.get("billing_term_months")

    try:
        months = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("Payment is missing a valid billing_term_months value.") from exc

    if months not in _ALLOWED_TERM_MONTHS:
        raise ValueError(
            f"Unsupported billing term {months!r}; allowed values are 1, 6, or 12 months."
        )
    return months


async def grant_entitlement_for_settled_payment(
    *,
    db: AsyncSession,
    transaction: PaymentTransaction,
    now: datetime | None = None,
) -> AccessEntitlement:
    """Create exactly one access grant for one fully-settled payment.

    Renewal semantics:
    - If the same plan still has unused time, the new grant starts at the
      furthest existing expiration.  Paying early therefore never loses days.
    - If the same plan is already expired, the new grant starts now.
    - Each payment gets its own entitlement row for an immutable audit trail.

    Concurrency semantics:
    - The owning User row is locked while the renewal boundary is calculated.
      This serializes simultaneous purchases for the same account while
      allowing unrelated users to proceed concurrently.
    - Database UNIQUE constraints on source payment/transaction provide the
      final duplicate-safety boundary.

    The function deliberately flushes but does not commit.  The caller owns the
    transaction so payment truth, entitlement creation, and webhook completion
    can be committed atomically.
    """
    if transaction.provider != "btcpay":
        raise ValueError("Entitlement grant received a non-BTCPay transaction.")
    if transaction.status != "Settled" or transaction.paid_at is None:
        raise ValueError("Only a fully settled payment may grant access.")
    if not transaction.provider_payment_id:
        raise ValueError("Settled payment is missing provider_payment_id.")
    if not transaction.plan_code:
        raise ValueError("Settled payment is missing plan_code.")

    term_months = _term_months(transaction)
    effective_now = _as_utc(now) if now is not None else _utc_now()

    # Serialize entitlement calculations for this user.  This protects early
    # renewal stacking even when multiple distinct payments settle at once.
    user_lock = await db.execute(
        select(User.id).where(User.id == transaction.user_id).with_for_update()
    )
    if user_lock.scalar_one_or_none() is None:
        raise ValueError("Payment owner no longer exists.")

    # A distinct BTCPay settlement event for the same invoice must not create a
    # second grant.  Check both natural source identifiers.
    existing_result = await db.execute(
        select(AccessEntitlement).where(
            or_(
                (
                    AccessEntitlement.source_provider == transaction.provider
                )
                & (
                    AccessEntitlement.source_payment_id
                    == transaction.provider_payment_id
                ),
                AccessEntitlement.source_transaction_id == transaction.id,
            )
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        return existing

    latest_result = await db.execute(
        select(AccessEntitlement)
        .where(
            AccessEntitlement.user_id == transaction.user_id,
            AccessEntitlement.plan_code == transaction.plan_code,
            AccessEntitlement.status == "ACTIVE",
        )
        .order_by(AccessEntitlement.expires_at.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()

    starts_at = effective_now
    if latest is not None:
        latest_expires_at = _as_utc(latest.expires_at)
        if latest_expires_at > effective_now:
            starts_at = latest_expires_at

    expires_at = _add_calendar_months(starts_at, term_months)

    entitlement = AccessEntitlement(
        user_id=transaction.user_id,
        plan_code=transaction.plan_code,
        status="ACTIVE",
        starts_at=starts_at,
        expires_at=expires_at,
        source_provider=transaction.provider,
        source_payment_id=transaction.provider_payment_id,
        source_transaction_id=transaction.id,
        created_at=effective_now,
        updated_at=effective_now,
        metadata_payload={
            "billing_term_months": term_months,
            "grant_reason": "full_payment_settlement",
        },
    )
    db.add(entitlement)
    await db.flush()
    return entitlement
