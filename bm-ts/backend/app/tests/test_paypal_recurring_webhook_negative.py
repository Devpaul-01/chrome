from __future__ import annotations
import pytest
from sqlalchemy import select
from app.api.routers import payments
from app.db.models import AccessEntitlement, NotificationOutbox, PaymentWebhookEvent

@pytest.mark.asyncio
@pytest.mark.parametrize("event_type",[
    "BILLING.SUBSCRIPTION.ACTIVATED",
    "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.EXPIRED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    "PAYMENT.SALE.REFUNDED",
    "PAYMENT.SALE.REVERSED",
])
async def test_non_settlement_subscription_events_never_grant_or_notify(async_client,db_session,test_user,monkeypatch,event_type):
    monkeypatch.setattr(payments.settings,"paypal_enabled",True)
    async def verified(headers,event): return True
    monkeypatch.setattr(payments,"verify_paypal_webhook",verified)
    event={"id":"EV-"+event_type.replace(".","-"),"event_type":event_type,"resource":{"id":"RESOURCE-1","billing_agreement_id":"I-SUB-1"}}
    r=await async_client.post("/api/payments/paypal/webhook",json=event,headers={"paypal-transmission-id":"T-"+event_type})
    assert r.status_code==200,r.text
    body=r.json()
    lifecycle_events={
        "BILLING.SUBSCRIPTION.ACTIVATED",
        "BILLING.SUBSCRIPTION.CANCELLED",
        "BILLING.SUBSCRIPTION.SUSPENDED",
        "BILLING.SUBSCRIPTION.EXPIRED",
        "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    }
    expected_reason="subscription_not_found" if event_type in lifecycle_events else "non_settlement_event"
    assert body["processed"] is False and body["reason"]==expected_reason
    assert (await db_session.execute(select(AccessEntitlement).where(AccessEntitlement.source_provider=="paypal"))).scalars().all()==[]
    assert (await db_session.execute(select(NotificationOutbox).where(NotificationOutbox.user_id==test_user.id))).scalars().all()==[]
    ledger=(await db_session.execute(select(PaymentWebhookEvent).where(PaymentWebhookEvent.provider_event_id==event["id"]))).scalar_one()
    assert ledger.processing_status=="ignored"

@pytest.mark.asyncio
async def test_completed_sale_for_unknown_subscription_never_grants_or_notifies(async_client,db_session,test_user,monkeypatch):
    monkeypatch.setattr(payments.settings,"paypal_enabled",True)
    async def verified(headers,event): return True
    monkeypatch.setattr(payments,"verify_paypal_webhook",verified)
    event={"id":"EV-UNKNOWN-SALE","event_type":"PAYMENT.SALE.COMPLETED","resource":{"id":"SALE-UNKNOWN","state":"COMPLETED","billing_agreement_id":"I-UNKNOWN","amount":{"total":"9.70","currency":"USD"}}}
    r=await async_client.post("/api/payments/paypal/webhook",json=event,headers={"paypal-transmission-id":"T-UNKNOWN"})
    assert r.status_code==200,r.text
    assert r.json()["processed"] is False and r.json()["reason"]=="subscription_not_found"
    assert (await db_session.execute(select(AccessEntitlement).where(AccessEntitlement.source_provider=="paypal"))).scalars().all()==[]
    assert (await db_session.execute(select(NotificationOutbox).where(NotificationOutbox.user_id==test_user.id))).scalars().all()==[]
