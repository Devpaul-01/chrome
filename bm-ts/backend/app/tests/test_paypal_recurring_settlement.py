from __future__ import annotations
from datetime import datetime,timezone
import uuid,pytest
from sqlalchemy import select
from app.db.models import AccessEntitlement,NotificationOutbox,RecurringSubscription
from app.services.paypal_recurring_settlement import settle_paypal_subscription_sale

async def mk(db,user):
    now=datetime.now(timezone.utc);r=RecurringSubscription(id=uuid.uuid4(),user_id=user.id,provider="paypal",provider_subscription_id="I-SUB-1",provider_plan_id="P-MONTH",plan_code="monthly",status="ACTIVE",next_billing_at=None,cancel_at_period_end=False,created_at=now,updated_at=now,metadata_payload={});db.add(r);await db.commit();await db.refresh(r);return r

@pytest.mark.asyncio
async def test_completed_sale_grants_and_queues(db_session,test_user,monkeypatch):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY","9.70");monkeypatch.setenv("BTCPAY_CURRENCY","USD");sub=await mk(db_session,test_user)
    o=await settle_paypal_subscription_sale(db=db_session,sale={"id":"SALE-1","state":"COMPLETED","amount":{"total":"9.70","currency":"USD"}},subscription=sub,subscription_snapshot={"id":"I-SUB-1","plan_id":"P-MONTH"},source="test")
    assert o["settled"] is True
    assert len((await db_session.execute(select(AccessEntitlement).where(AccessEntitlement.source_payment_id=="SALE-1"))).scalars().all())==1
    notes=(await db_session.execute(select(NotificationOutbox).where(NotificationOutbox.source_transaction_id==o["transaction"].id))).scalars().all()
    assert any(n.notification_type=="subscription_activated" for n in notes)

@pytest.mark.asyncio
@pytest.mark.parametrize("sale,snap,reason",[
({"id":"S2","state":"PENDING","amount":{"total":"9.70","currency":"USD"}},{"id":"I-SUB-1","plan_id":"P-MONTH"},"sale_not_completed"),
({"id":"S3","state":"COMPLETED","amount":{"total":"4.00","currency":"USD"}},{"id":"I-SUB-1","plan_id":"P-MONTH"},"amount_mismatch"),
({"id":"S4","state":"COMPLETED","amount":{"total":"9.70","currency":"EUR"}},{"id":"I-SUB-1","plan_id":"P-MONTH"},"currency_mismatch"),
({"id":"S5","state":"COMPLETED","amount":{"total":"9.70","currency":"USD"}},{"id":"OTHER","plan_id":"P-MONTH"},"subscription_identity_mismatch"),
({"id":"S6","state":"COMPLETED","amount":{"total":"9.70","currency":"USD"}},{"id":"I-SUB-1","plan_id":"WRONG"},"subscription_plan_mismatch")])
async def test_bad_financial_truth_never_grants_or_notifies(db_session,test_user,monkeypatch,sale,snap,reason):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY","9.70");monkeypatch.setenv("BTCPAY_CURRENCY","USD");sub=await mk(db_session,test_user)
    o=await settle_paypal_subscription_sale(db=db_session,sale=sale,subscription=sub,subscription_snapshot=snap,source="test")
    assert o["settled"] is False and o["reason"]==reason
    assert (await db_session.execute(select(AccessEntitlement).where(AccessEntitlement.source_provider=="paypal"))).scalars().all()==[]
    assert (await db_session.execute(select(NotificationOutbox).where(NotificationOutbox.user_id==test_user.id))).scalars().all()==[]

@pytest.mark.asyncio
async def test_duplicate_sale_exactly_once(db_session,test_user,monkeypatch):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY","9.70");monkeypatch.setenv("BTCPAY_CURRENCY","USD");sub=await mk(db_session,test_user)
    sale={"id":"SALE-DUP","state":"COMPLETED","amount":{"total":"9.70","currency":"USD"}};snap={"id":"I-SUB-1","plan_id":"P-MONTH"}
    a=await settle_paypal_subscription_sale(db=db_session,sale=sale,subscription=sub,subscription_snapshot=snap,source="first");await db_session.commit()
    b=await settle_paypal_subscription_sale(db=db_session,sale=sale,subscription=sub,subscription_snapshot=snap,source="again")
    assert a["settled"] and b["settled"] and b["reason"]=="already_processed"
    assert len((await db_session.execute(select(AccessEntitlement).where(AccessEntitlement.source_payment_id=="SALE-DUP"))).scalars().all())==1
