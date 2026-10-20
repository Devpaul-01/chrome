"""Sequential PayPal settlement idempotency tests; synthetic sale only."""
from datetime import datetime, timezone
from sqlalchemy import select, func
import pytest
from app.db.models import PaymentTransaction, AccessEntitlement
from decimal import Decimal
from types import SimpleNamespace
import app.services.paypal_recurring_settlement as settlement_module

def get_payment_plan(code):
    if code != "monthly":
        raise AssertionError("unexpected plan")
    return SimpleNamespace(amount=Decimal("9.70"), currency="USD", term_months=1)

@pytest.fixture(autouse=True)
def _synthetic_plan_catalog(monkeypatch):
    monkeypatch.setattr(settlement_module, "get_payment_plan", get_payment_plan)

from app.services.paypal_recurring_settlement import settle_paypal_subscription_sale
from test_paypal_settlement_rejections_v664 import agreement

@pytest.mark.asyncio
async def test_completed_sale_then_redelivery_creates_one_payment_and_grant(db_session,test_user):
    sub=agreement(test_user)
    db_session.add(sub)
    await db_session.commit()
    plan=get_payment_plan("monthly")
    sale={"id":"S-V668-ONCE","state":"COMPLETED","amount":{"total":str(plan.amount),"currency":plan.currency}}
    snapshot={"id":sub.provider_subscription_id,"status":"ACTIVE","plan_id":sub.provider_plan_id}
    first=await settle_paypal_subscription_sale(
        db=db_session,sale=sale,subscription=sub,
        subscription_snapshot=snapshot,source="v668_synthetic")
    assert first["settled"] is True
    assert first["reason"]=="settled"
    await db_session.commit()
    second=await settle_paypal_subscription_sale(
        db=db_session,sale=sale,subscription=sub,
        subscription_snapshot=snapshot,source="v668_redelivery")
    assert second["settled"] is True
    assert second["reason"]=="already_processed"
    await db_session.commit()
    txs=(await db_session.execute(select(PaymentTransaction).where(
        PaymentTransaction.provider=="paypal",
        PaymentTransaction.provider_payment_id=="S-V668-ONCE"))).scalars().all()
    grants=(await db_session.execute(select(AccessEntitlement).where(
        AccessEntitlement.source_provider=="paypal",
        AccessEntitlement.source_payment_id=="S-V668-ONCE"))).scalars().all()
    assert len(txs)==1
    assert len(grants)==1
    assert grants[0].source_transaction_id==txs[0].id

@pytest.mark.asyncio
async def test_duplicate_redelivery_with_conflicting_payload_does_not_grant_again(db_session,test_user):
    sub=agreement(test_user)
    db_session.add(sub)
    await db_session.commit()
    plan=get_payment_plan("monthly")
    sale={"id":"S-V668-CONFLICT","state":"COMPLETED","amount":{"total":str(plan.amount),"currency":plan.currency}}
    snapshot={"id":sub.provider_subscription_id,"status":"ACTIVE","plan_id":sub.provider_plan_id}
    first=await settle_paypal_subscription_sale(db=db_session,sale=sale,subscription=sub,subscription_snapshot=snapshot,source="v668_synthetic")
    assert first["settled"] is True
    await db_session.commit()
    bad={"id":"S-V668-CONFLICT","state":"PENDING","amount":{"total":"0.01","currency":"USD"}}
    replay=await settle_paypal_subscription_sale(db=db_session,sale=bad,subscription=sub,subscription_snapshot=snapshot,source="v668_replay")
    assert replay["reason"]=="already_processed"
    assert replay["settled"] is True
    tx_count=(await db_session.execute(select(func.count()).select_from(PaymentTransaction).where(PaymentTransaction.provider_payment_id=="S-V668-CONFLICT"))).scalar_one()
    grant_count=(await db_session.execute(select(func.count()).select_from(AccessEntitlement).where(AccessEntitlement.source_payment_id=="S-V668-CONFLICT"))).scalar_one()
    assert tx_count==1
    assert grant_count==1
