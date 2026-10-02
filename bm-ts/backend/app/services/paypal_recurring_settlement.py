from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import PaymentTransaction, RecurringSubscription, User
from app.services.entitlements import grant_entitlement_for_settled_payment
from app.services.notifications import enqueue_payment_lifecycle_notifications
from app.services.payment_plans import get_payment_plan

def _money(value) -> Decimal:
    try:
        amount=Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("invalid_sale_amount") from exc
    if not amount.is_finite() or amount <= 0 or amount.as_tuple().exponent < -2:
        raise ValueError("invalid_sale_amount")
    return amount.quantize(Decimal("0.01"))

async def settle_paypal_subscription_sale(*,db:AsyncSession,sale:dict,subscription:RecurringSubscription,subscription_snapshot:dict,source:str):
    sale_id=str(sale.get("id") or "").strip()
    if not sale_id:return {"settled":False,"reason":"missing_sale_id"}
    existing=(await db.execute(select(PaymentTransaction).where(PaymentTransaction.provider=="paypal",PaymentTransaction.provider_payment_id==sale_id))).scalar_one_or_none()
    if existing is not None:return {"settled":existing.status=="Settled","reason":"already_processed","transaction":existing}
    if str(sale.get("state") or sale.get("status") or "").upper()!="COMPLETED":return {"settled":False,"reason":"sale_not_completed"}
    if str(subscription_snapshot.get("id") or "").strip()!=subscription.provider_subscription_id:return {"settled":False,"reason":"subscription_identity_mismatch"}
    if str(subscription_snapshot.get("plan_id") or "").strip()!=subscription.provider_plan_id:return {"settled":False,"reason":"subscription_plan_mismatch"}
    plan=get_payment_plan(subscription.plan_code);obj=sale.get("amount") if isinstance(sale.get("amount"),dict) else {}
    try: amount=_money(obj.get("total") if "total" in obj else obj.get("value"))
    except ValueError:return {"settled":False,"reason":"invalid_sale_amount"}
    currency=str(obj.get("currency") or obj.get("currency_code") or "").upper()
    if amount!=plan.amount:return {"settled":False,"reason":"amount_mismatch"}
    if currency!=plan.currency.upper():return {"settled":False,"reason":"currency_mismatch"}
    now=datetime.now(timezone.utc)
    tx=PaymentTransaction(id=uuid4(),user_id=subscription.user_id,provider="paypal",provider_payment_id=sale_id,provider_order_id=subscription.provider_subscription_id,checkout_attempt_id=None,amount=amount,currency=currency,status="Settled",checkout_url=None,payment_method="paypal_subscription",plan_code=subscription.plan_code,paid_at=now,expires_at=None,created_at=now,updated_at=now,metadata_payload={"billing_term_months":plan.term_months,"paypal_subscription_id":subscription.provider_subscription_id,"settlement_source":source})
    db.add(tx);await db.flush()
    entitlement=await grant_entitlement_for_settled_payment(db=db,transaction=tx,now=now)
    user=await db.get(User,subscription.user_id)
    if user is None:raise ValueError("payment_owner_not_found")
    await enqueue_payment_lifecycle_notifications(db=db,user=user,transaction=tx,entitlement=entitlement,now=now)
    await db.flush()
    return {"settled":True,"reason":"settled","transaction":tx,"entitlement":entitlement}
