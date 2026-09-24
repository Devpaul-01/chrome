from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PaymentTransaction, User
from app.services.entitlements import grant_entitlement_for_settled_payment
from app.services.notifications import enqueue_payment_lifecycle_notifications


def _money(value: Any) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Rapyd payment has invalid amount.") from exc
    if not amount.is_finite() or amount.as_tuple().exponent < -2:
        raise ValueError("Rapyd payment has invalid money precision.")
    return amount.quantize(Decimal("0.01"))


async def settle_rapyd_payment_snapshot(
    *,
    db: AsyncSession,
    payment: dict[str, Any],
    source: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Apply authoritative Rapyd payment truth exactly once.

    This function is provider-event agnostic. Authenticated webhooks and
    reconciliation must both call this same primitive.

    It deliberately does not commit. The caller owns the transaction boundary
    so payment settlement, entitlement creation, and notification outbox writes
    remain atomic.
    """
    payment_id = str(payment.get("id") or "").strip()
    reference = str(payment.get("merchant_reference_id") or "").strip()

    if not payment_id:
        raise ValueError("Rapyd payment snapshot is missing payment id.")
    if not payment_id.startswith("payment_"):
        raise ValueError("Rapyd payment id is invalid.")
    if not reference:
        return {
            "settled": False,
            "reason": "missing_merchant_reference_id",
            "transaction": None,
        }

    tx = (
        await db.execute(
            select(PaymentTransaction)
            .where(
                PaymentTransaction.provider == "rapyd",
                PaymentTransaction.provider_order_id == reference,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()

    if tx is None:
        return {
            "settled": False,
            "reason": "payment_not_found",
            "transaction": None,
        }

    raw_amount = payment.get("original_amount")
    if raw_amount is None:
        raw_amount = payment.get("amount")

    provider_amount = _money(raw_amount)
    expected_amount = _money(tx.amount)
    provider_status = str(payment.get("status") or "").upper()
    currency = str(payment.get("currency_code") or "").upper()
    paid = payment.get("paid") is True
    partial = payment.get("is_partial") is True

    full = (
        provider_status == "CLO"
        and paid
        and not partial
        and provider_amount == expected_amount
        and currency == str(tx.currency).upper()
    )

    effective_now = now or datetime.now(timezone.utc)
    meta = dict(tx.metadata_payload or {})
    meta.update(
        {
            "last_rapyd_source": source,
            "rapyd_payment_id": payment_id,
            "rapyd_payment_status": provider_status,
            "rapyd_paid": paid,
            "rapyd_is_partial": partial,
            "rapyd_currency_code": currency,
            "rapyd_reported_amount": str(provider_amount),
            "rapyd_merchant_reference_id": reference,
        }
    )
    tx.metadata_payload = meta
    tx.updated_at = effective_now

    already_settled = tx.status == "Settled" or tx.paid_at is not None

    if not full:
        if not already_settled:
            tx.status = "Processing"
        await db.flush()
        return {
            "settled": False,
            "reason": "financial_truth_not_final",
            "transaction": tx,
        }

    if tx.provider_payment_id not in {None, "", payment_id}:
        raise ValueError("Rapyd payment identity conflicts with existing transaction.")

    owner = (
        await db.execute(
            select(PaymentTransaction.id).where(
                PaymentTransaction.provider == "rapyd",
                PaymentTransaction.provider_payment_id == payment_id,
                PaymentTransaction.id != tx.id,
            )
        )
    ).scalar_one_or_none()

    if owner is not None:
        return {
            "settled": False,
            "reason": "payment_identity_already_bound",
            "transaction": tx,
        }

    tx.provider_payment_id = payment_id
    tx.status = "Settled"
    if tx.paid_at is None:
        tx.paid_at = effective_now

    entitlement = await grant_entitlement_for_settled_payment(
        db=db,
        transaction=tx,
        now=effective_now,
    )

    user = (
        await db.execute(select(User).where(User.id == tx.user_id))
    ).scalar_one()

    await enqueue_payment_lifecycle_notifications(
        db=db,
        user=user,
        transaction=tx,
        entitlement=entitlement,
        now=effective_now,
    )

    await db.flush()

    return {
        "settled": True,
        "reason": "settled",
        "transaction": tx,
        "entitlement": entitlement,
    }
