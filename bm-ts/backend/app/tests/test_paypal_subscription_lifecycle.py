from __future__ import annotations
from datetime import datetime,timezone
import uuid,pytest
from sqlalchemy import select
from app.api.routers import payments,subscription as subrouter
from app.db.models import AccessEntitlement,NotificationOutbox,RecurringSubscription
from app.services.paypal_subscription_lifecycle import apply_paypal_subscription_lifecycle
def rec(user):
    n=datetime.now(timezone.utc);return RecurringSubscription(id=uuid.uuid4(),user_id=user.id,provider="paypal",provider_subscription_id="I-LIFE",provider_plan_id="P-MONTH",plan_code="monthly",status="APPROVAL_PENDING",next_billing_at=None,cancel_at_period_end=False,created_at=n,updated_at=n,metadata_payload={})
@pytest.mark.parametrize("event,status",[("BILLING.SUBSCRIPTION.ACTIVATED","ACTIVE"),("BILLING.SUBSCRIPTION.CANCELLED","CANCELLED"),("BILLING.SUBSCRIPTION.SUSPENDED","SUSPENDED"),("BILLING.SUBSCRIPTION.EXPIRED","EXPIRED"),("BILLING.SUBSCRIPTION.PAYMENT.FAILED","PAYMENT_FAILED")])
def test_mapping(event,status,test_user):
    r=rec(test_user);assert apply_paypal_subscription_lifecycle(subscription=r,event_type=event,resource={"billing_info":{"next_billing_time":"2026-11-02T00:00:00Z"}});assert r.status==status
@pytest.mark.asyncio
async def test_activation_state_only(async_client,db_session,test_user,monkeypatch):
    r=rec(test_user);db_session.add(r);await db_session.commit();monkeypatch.setattr(payments.settings,"paypal_enabled",True)
    async def verified(headers,event):return True
    monkeypatch.setattr(payments,"verify_paypal_webhook",verified)
    e={"id":"EV-ACT","event_type":"BILLING.SUBSCRIPTION.ACTIVATED","resource":{"id":"I-LIFE","billing_info":{"next_billing_time":"2026-11-02T00:00:00Z"}}}
    x=await async_client.post("/api/payments/paypal/webhook",json=e,headers={"paypal-transmission-id":"T-ACT"});assert x.status_code==200 and x.json()["reason"]=="subscription_state_updated";await db_session.refresh(r);assert r.status=="ACTIVE"
    assert (await db_session.execute(select(AccessEntitlement).where(AccessEntitlement.source_provider=="paypal"))).scalars().all()==[]
    assert (await db_session.execute(select(NotificationOutbox).where(NotificationOutbox.user_id==test_user.id))).scalars().all()==[]
@pytest.mark.asyncio
async def test_paypal_cancel_dispatch(db_session,test_user,monkeypatch):
    r=rec(test_user);r.status="ACTIVE";db_session.add(r);await db_session.commit();called=[]
    async def fake(sid):called.append(sid)
    monkeypatch.setattr(subrouter,"cancel_paypal_subscription",fake);x=await subrouter.cancel(current_user=test_user,db=db_session);assert called==["I-LIFE"] and x.cancel_at_period_end is True;await db_session.refresh(r);assert r.cancel_at_period_end is True
