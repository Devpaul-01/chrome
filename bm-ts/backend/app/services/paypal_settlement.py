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
        raise ValueError("PayPal capture has invalid amount.") from exc
    if not amount.is_finite() or amount.as_tuple().exponent < -2:
        raise ValueError("PayPal capture has invalid money precision.")
    return amount.quantize(Decimal("0.01"))

async def settle_paypal_capture(*, db: AsyncSession, capture: dict[str, Any], order_id: str, source: str, now: datetime | None = None) -> dict[str, Any]:
    capture_id = str(capture.get("id") or "").strip()
    if not capture_id or not order_id:
        raise ValueError("PayPal capture identity is incomplete.")
    tx = (await db.execute(select(PaymentTransaction).where(PaymentTransaction.provider == "paypal", PaymentTransaction.provider_order_id == order_id).with_for_update())).scalar_one_or_none()
    if tx is None:
        return {"settled": False, "reason": "payment_not_found", "transaction": None}
    amount_data = capture.get("amount") if isinstance(capture.get("amount"), dict) else {}
    provider_amount = _money(amount_data.get("value"))
    expected_amount = _money(tx.amount)
    currency = str(amount_data.get("currency_code") or "").upper()
    provider_status = str(capture.get("status") or "").upper()
    effective_now = now or datetime.now(timezone.utc)
    meta = dict(tx.metadata_payload or {})
    meta.update({"last_paypal_source": source, "paypal_capture_id": capture_id, "paypal_capture_status": provider_status, "paypal_reported_amount": str(provider_amount), "paypal_currency_code": currency, "paypal_order_id": order_id})
    tx.metadata_payload = meta
    tx.updated_at = effective_now
    already_settled = tx.status == "Settled" or tx.paid_at is not None
    full = provider_status == "COMPLETED" and provider_amount == expected_amount and currency == str(tx.currency).upper()
    if not full:
        if not already_settled:
            tx.status = "Processing"
        await db.flush()
        return {"settled": False, "reason": "financial_truth_not_final", "transaction": tx}
    if tx.provider_payment_id not in {None, "", capture_id}:
        raise ValueError("PayPal capture identity conflicts with existing transaction.")
    owner = (await db.execute(select(PaymentTransaction.id).where(PaymentTransaction.provider == "paypal", PaymentTransaction.provider_payment_id == capture_id, PaymentTransaction.id != tx.id))).scalar_one_or_none()
    if owner is not None:
        return {"settled": False, "reason": "payment_identity_already_bound", "transaction": tx}
    tx.provider_payment_id = capture_id
    tx.status = "Settled"
    if tx.paid_at is None:
        tx.paid_at = effective_now
    entitlement = await grant_entitlement_for_settled_payment(db=db, transaction=tx, now=effective_now)
    user = (await db.execute(select(User).where(User.id == tx.user_id))).scalar_one()
    await enqueue_payment_lifecycle_notifications(db=db, user=user, transaction=tx, entitlement=entitlement, now=effective_now)
    await db.flush()
    return {"settled": True, "reason": "settled", "transaction": tx, "entitlement": entitlement}
