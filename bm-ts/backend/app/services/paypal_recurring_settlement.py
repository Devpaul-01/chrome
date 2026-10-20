from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import PaymentTransaction, RecurringSubscription, User, PlanSwitchIntent
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
    provider_plan_id = str(subscription_snapshot.get("plan_id") or "").strip()
    if str(subscription_snapshot.get("status") or "").upper() != "ACTIVE":
        return {"settled":False,"reason":"subscription_not_active"}
    # Lock the existing recurring agreement and candidate intent before deciding
    # which plan's amount/currency to validate. Never trust webhook plan claims.
    locked_subscription = (await db.execute(select(RecurringSubscription).where(
        RecurringSubscription.id == subscription.id,
        RecurringSubscription.user_id == subscription.user_id,
        RecurringSubscription.provider == "paypal",
    ).with_for_update())).scalar_one_or_none()
    if locked_subscription is None:
        return {"settled":False,"reason":"recurring_agreement_not_found"}
    subscription = locked_subscription
    intent = None
    selected_plan_code = subscription.plan_code
    if provider_plan_id != subscription.provider_plan_id:
        from app.services.paypal import subscription_plan_id
        intents = (await db.execute(select(PlanSwitchIntent).where(
            PlanSwitchIntent.user_id == subscription.user_id,
            PlanSwitchIntent.provider == "paypal",
            PlanSwitchIntent.status == "AWAITING_SETTLEMENT",
        ).with_for_update())).scalars().all()
        matching = [row for row in intents if
            (row.metadata_payload or {}).get("provider_revision_confirmed") is True
            and (row.metadata_payload or {}).get("provider_subscription_id") == subscription.provider_subscription_id
            and row.provider_reference in (None, subscription.provider_subscription_id)
            and not (row.metadata_payload or {}).get("settled_transaction_id")
            and subscription_plan_id(row.target_plan) == provider_plan_id]
        if len(matching) != 1:
            return {"settled":False,"reason":"revised_plan_intent_not_confirmed"}
        intent = matching[0]
        selected_plan_code = intent.target_plan
    plan=get_payment_plan(selected_plan_code);obj=sale.get("amount") if isinstance(sale.get("amount"),dict) else {}
    try: amount=_money(obj.get("total") if "total" in obj else obj.get("value"))
    except ValueError:return {"settled":False,"reason":"invalid_sale_amount"}
    currency=str(obj.get("currency") or obj.get("currency_code") or "").upper()
    if amount!=plan.amount:return {"settled":False,"reason":"amount_mismatch"}
    if currency!=plan.currency.upper():return {"settled":False,"reason":"currency_mismatch"}
    now=datetime.now(timezone.utc)
    tx=PaymentTransaction(id=uuid4(),user_id=subscription.user_id,provider="paypal",provider_payment_id=sale_id,provider_order_id=subscription.provider_subscription_id,checkout_attempt_id=None,amount=amount,currency=currency,status="Settled",checkout_url=None,payment_method="paypal_subscription",plan_code=selected_plan_code,paid_at=now,expires_at=None,created_at=now,updated_at=now,metadata_payload={"billing_term_months":plan.term_months,"paypal_subscription_id":subscription.provider_subscription_id,"settlement_source":source})
    db.add(tx);await db.flush()
    entitlement=await grant_entitlement_for_settled_payment(db=db,transaction=tx,now=now)
    # Reconcile only after an authoritative, financially validated sale and entitlement.
    # Do not alter an existing PayPal agreement here: its plan ID must already match
    # the locally approved agreement (checked above). Ambiguous revisions fail closed.
    # Only a financially validated sale under the provider-confirmed target plan
    # may synchronize the existing recurring agreement. The caller must commit
    # this transaction atomically with the entitlement and intent transition.
    if intent is not None:
        subscription.plan_code = selected_plan_code
        subscription.provider_plan_id = provider_plan_id
    if intent is not None:
        meta=dict(intent.metadata_payload or {})
        if (meta.get("provider_revision_confirmed") is True
            and meta.get("provider_subscription_id")==subscription.provider_subscription_id
            and intent.target_plan==selected_plan_code
            and intent.provider_reference in (None, subscription.provider_subscription_id)
            and not meta.get("settled_transaction_id")):
            meta["settled_transaction_id"]=str(tx.id)
            meta["settled_provider_payment_id"]=sale_id
            intent.metadata_payload=meta
            intent.provider_reference=subscription.provider_subscription_id
            intent.status="COMPLETE"
            intent.updated_at=now
        # Else leave intent unresolved; a payment must never complete an
        # unapproved or mismatched plan change.
    user=await db.get(User,subscription.user_id)
    if user is None:raise ValueError("payment_owner_not_found")
    await enqueue_payment_lifecycle_notifications(db=db,user=user,transaction=tx,entitlement=entitlement,now=now)
    await db.flush()
    return {"settled":True,"reason":"settled","transaction":tx,"entitlement":entitlement}
