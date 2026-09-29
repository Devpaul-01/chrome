from decimal import Decimal
import pytest
from app.services import paypal
def test_environment(monkeypatch):
 monkeypatch.setattr(paypal.settings,"paypal_environment","sandbox"); assert paypal.base_url()=="https://api-m.sandbox.paypal.com"
 monkeypatch.setattr(paypal.settings,"paypal_environment","live"); assert paypal.base_url()=="https://api-m.paypal.com"
def test_environment_fails_closed(monkeypatch):
 monkeypatch.setattr(paypal.settings,"paypal_environment","bad")
 with pytest.raises(paypal.PayPalConfigurationError): paypal.base_url()
def test_request_id():
 assert paypal.request_id("create","x")==paypal.request_id("create","x")
 assert paypal.request_id("create","x")!=paypal.request_id("capture","x")
def test_approval_url():
 assert paypal.approval_url({"links":[{"rel":"approve","href":"https://www.sandbox.paypal.com/x"}]}).startswith("https://")
 with pytest.raises(paypal.PayPalResponseError): paypal.approval_url({"links":[]})
@pytest.mark.asyncio
async def test_create_order(monkeypatch):
 monkeypatch.setattr(paypal.settings,"paypal_return_url","https://example.test/r"); monkeypatch.setattr(paypal.settings,"paypal_cancel_url","https://example.test/c"); seen={}
 async def fake(method,path,*,payload=None,idempotency_key=None): seen.update(path=path,payload=payload,key=idempotency_key); return {"id":"O1"}
 monkeypatch.setattr(paypal,"request",fake)
 await paypal.create_order(amount=Decimal("9.70"),currency="USD",description="Monthly",custom_id="a1",idempotency_key="k1")
 assert seen["path"]=="/v2/checkout/orders"; assert seen["payload"]["purchase_units"][0]["amount"]=={"currency_code":"USD","value":"9.70"}
