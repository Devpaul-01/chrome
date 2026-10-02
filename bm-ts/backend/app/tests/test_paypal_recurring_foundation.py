from __future__ import annotations
import pytest
from app.services import paypal

def test_paypal_recurring_plan_ids_are_server_owned(monkeypatch):
    monkeypatch.setattr(paypal.settings, "paypal_plan_monthly", "P-MONTH")
    monkeypatch.setattr(paypal.settings, "paypal_plan_yearly", "P-YEAR")
    assert paypal.subscription_plan_id("monthly") == "P-MONTH"
    assert paypal.subscription_plan_id("yearly") == "P-YEAR"

def test_paypal_recurring_plan_missing_fails_closed(monkeypatch):
    monkeypatch.setattr(paypal.settings, "paypal_plan_monthly", "")
    with pytest.raises(paypal.PayPalConfigurationError):
        paypal.subscription_plan_id("monthly")

@pytest.mark.asyncio
async def test_create_subscription_uses_paypal_subscriptions_api(monkeypatch):
    monkeypatch.setattr(paypal.settings, "paypal_plan_monthly", "P-MONTH")
    monkeypatch.setattr(paypal.settings, "paypal_return_url", "https://example.test/return")
    monkeypatch.setattr(paypal.settings, "paypal_cancel_url", "https://example.test/cancel")
    seen={}
    async def fake(method,path,*,payload=None,idempotency_key=None):
        seen.update(method=method,path=path,payload=payload,key=idempotency_key)
        return {"id":"I-SUB","status":"APPROVAL_PENDING","links":[{"rel":"approve","href":"https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=x"}]}
    monkeypatch.setattr(paypal,"request",fake)
    result=await paypal.create_subscription(plan_code="monthly",custom_id="user:abc",idempotency_key="idem")
    assert seen["path"]=="/v1/billing/subscriptions"
    assert seen["payload"]["plan_id"]=="P-MONTH"
    assert seen["payload"]["custom_id"]=="user:abc"
    assert paypal.subscription_approval_url(result).startswith("https://")
