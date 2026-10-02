from __future__ import annotations
import pytest
from sqlalchemy import select
from app.api.routers import payments
from app.db.models import AccessEntitlement, RecurringSubscription

@pytest.mark.asyncio
async def test_recurring_checkout_creates_agreement_without_entitlement(async_client, db_session, monkeypatch):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", "9.70")
    monkeypatch.setenv("BTCPAY_CURRENCY", "USD")
    monkeypatch.setattr(payments.settings, "paypal_enabled", True)
    monkeypatch.setattr(payments, "paypal_subscription_plan_id", lambda code: "P-MONTH")
    async def fake_create_subscription(**kwargs):
        return {"id":"I-TEST-SUB","status":"APPROVAL_PENDING","links":[{"rel":"approve","href":"https://www.sandbox.paypal.com/approve"}]}
    monkeypatch.setattr(payments, "paypal_create_subscription", fake_create_subscription)
    r=await async_client.post("/api/payments/paypal/subscription/checkout",json={"plan_code":"monthly"},headers={"Idempotency-Key":"recurring-checkout-0001"})
    assert r.status_code==201, r.text
    assert r.json()["subscription_id"]=="I-TEST-SUB"
    row=(await db_session.execute(select(RecurringSubscription).where(RecurringSubscription.provider_subscription_id=="I-TEST-SUB"))).scalar_one()
    assert row.status=="APPROVAL_PENDING"
    ent=(await db_session.execute(select(AccessEntitlement).where(AccessEntitlement.source_provider=="paypal"))).scalars().all()
    assert ent==[]

@pytest.mark.asyncio
async def test_recurring_checkout_same_key_reuses(async_client, monkeypatch):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", "9.70")
    monkeypatch.setenv("BTCPAY_CURRENCY", "USD")
    monkeypatch.setattr(payments.settings, "paypal_enabled", True)
    monkeypatch.setattr(payments, "paypal_subscription_plan_id", lambda code: "P-MONTH")
    calls=0
    async def fake_create_subscription(**kwargs):
        nonlocal calls
        calls+=1
        return {"id":"I-IDEMPOTENT","status":"APPROVAL_PENDING","links":[{"rel":"approve","href":"https://www.sandbox.paypal.com/approve"}]}
    monkeypatch.setattr(payments, "paypal_create_subscription", fake_create_subscription)
    h={"Idempotency-Key":"recurring-checkout-0002"}
    a=await async_client.post("/api/payments/paypal/subscription/checkout",json={"plan_code":"monthly"},headers=h)
    b=await async_client.post("/api/payments/paypal/subscription/checkout",json={"plan_code":"monthly"},headers=h)
    assert a.status_code==201 and b.status_code==200 and b.json()["reused"] is True and calls==1

@pytest.mark.asyncio
async def test_recurring_checkout_rejects_quarterly(async_client, monkeypatch):
    monkeypatch.setenv("BTCPAY_PRICE_3_MONTH", "29.10")
    monkeypatch.setenv("BTCPAY_CURRENCY", "USD")
    monkeypatch.setattr(payments.settings, "paypal_enabled", True)
    r=await async_client.post("/api/payments/paypal/subscription/checkout",json={"plan_code":"quarterly"},headers={"Idempotency-Key":"recurring-checkout-0003"})
    assert r.status_code==400
