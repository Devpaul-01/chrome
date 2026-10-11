from __future__ import annotations

import pytest
from app.services import rapyd

@pytest.mark.asyncio
async def test_retrieve_checkout_is_read_only_and_uses_exact_id(monkeypatch):
    calls = []
    async def fake_request(**kwargs):
        calls.append(kwargs)
        return {"id": "checkout_abc", "status": "DON"}
    monkeypatch.setattr(rapyd, "request", fake_request)
    result = await rapyd.retrieve_checkout("checkout_abc")
    assert result["id"] == "checkout_abc"
    assert calls == [{"method": "GET", "path": "/v1/checkout/checkout_abc"}]

@pytest.mark.asyncio
async def test_retrieve_payment_is_read_only_and_uses_exact_id(monkeypatch):
    calls = []
    async def fake_request(**kwargs):
        calls.append(kwargs)
        return {"id": "payment_abc", "status": "CLO", "paid": True, "is_partial": False}
    monkeypatch.setattr(rapyd, "request", fake_request)
    result = await rapyd.retrieve_payment("payment_abc")
    assert result["status"] == "CLO"
    assert calls == [{"method": "GET", "path": "/v1/payments/payment_abc"}]

@pytest.mark.asyncio
@pytest.mark.parametrize(("function", "bad_id"), [
    (rapyd.retrieve_checkout, ""),
    (rapyd.retrieve_checkout, "payment_wrong"),
    (rapyd.retrieve_payment, ""),
    (rapyd.retrieve_payment, "checkout_wrong"),
])
async def test_retrieval_rejects_wrong_identifier_type_without_provider_call(monkeypatch, function, bad_id):
    async def should_not_call(**kwargs):
        raise AssertionError("provider request must not be made")
    monkeypatch.setattr(rapyd, "request", should_not_call)
    with pytest.raises(ValueError):
        await function(bad_id)
