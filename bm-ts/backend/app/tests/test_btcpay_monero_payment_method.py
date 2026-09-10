from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.schemas.payment import BTCPayCheckoutRequest
from app.services import btcpay


def _settings():
    return SimpleNamespace(
        btcpay_url="https://btcpay.test",
        btcpay_store_id="store",
        btcpay_api_key="secret",
    )


class _Response:
    ok = True
    status_code = 200

    def json(self):
        return {
            "id": "invoice-test",
            "checkoutLink": "https://btcpay.test/i/invoice-test",
            "status": "New",
        }


def _capture_post(monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        captured["headers"] = kwargs.get("headers")
        return _Response()

    monkeypatch.setattr(btcpay, "settings", _settings())
    monkeypatch.setattr(btcpay.requests, "post", fake_post)
    return captured


def _invoice(payment_method="bitcoin"):
    return btcpay._create_invoice_sync({
        "amount": "10.00",
        "currency": "USD",
        "metadata": {"orderId": "BM-XMR-TEST"},
        **(
            {"checkout": {"paymentMethods": ["XMR-CHAIN"]}}
            if payment_method == "monero"
            else {}
        ),
    })


def test_checkout_request_defaults_to_bitcoin():
    request = BTCPayCheckoutRequest(plan_code="monthly")
    assert request.payment_method == "bitcoin"


def test_checkout_request_accepts_monero():
    request = BTCPayCheckoutRequest(plan_code="monthly", payment_method="monero")
    assert request.payment_method == "monero"


def test_checkout_request_rejects_unknown_payment_method():
    with pytest.raises(Exception):
        BTCPayCheckoutRequest(plan_code="monthly", payment_method="dogecoin")


@pytest.mark.asyncio
async def test_create_invoice_bitcoin_does_not_force_xmr(monkeypatch):
    captured = _capture_post(monkeypatch)

    result = await btcpay.create_invoice(
        amount=Decimal("10.00"),
        currency="USD",
        order_id="BM-BTC-TEST",
        description="Bitcoin checkout",
        user_id="user-1",
        payment_method="bitcoin",
    )

    assert result["id"] == "invoice-test"
    assert captured["json"]["checkout"]["paymentMethods"] == ["BTC-CHAIN"]
    assert captured["json"]["checkout"]["defaultPaymentMethod"] == "BTC-CHAIN"


@pytest.mark.asyncio
async def test_create_invoice_monero_restricts_checkout_to_xmr_chain(monkeypatch):
    captured = _capture_post(monkeypatch)

    result = await btcpay.create_invoice(
        amount=Decimal("10.00"),
        currency="USD",
        order_id="BM-XMR-TEST",
        description="Monero checkout",
        user_id="user-1",
        payment_method="monero",
    )

    assert result["id"] == "invoice-test"
    assert captured["json"]["checkout"]["paymentMethods"] == ["XMR-CHAIN"]
    assert captured["json"]["checkout"]["defaultPaymentMethod"] == "XMR-CHAIN"


@pytest.mark.asyncio
async def test_create_invoice_default_remains_bitcoin(monkeypatch):
    captured = _capture_post(monkeypatch)

    await btcpay.create_invoice(
        amount=Decimal("10.00"),
        currency="USD",
        order_id="BM-DEFAULT-TEST",
        description="Backward compatible checkout",
        user_id="user-1",
    )

    assert captured["json"]["checkout"]["paymentMethods"] == ["BTC-CHAIN"]
    assert captured["json"]["checkout"]["defaultPaymentMethod"] == "BTC-CHAIN"


@pytest.mark.asyncio
async def test_create_invoice_rejects_unsupported_method_before_provider_call(monkeypatch):
    captured = _capture_post(monkeypatch)

    with pytest.raises(ValueError, match="Unsupported BTCPay payment method"):
        await btcpay.create_invoice(
            amount=Decimal("10.00"),
            currency="USD",
            order_id="BM-BAD-TEST",
            description="Unsupported checkout",
            user_id="user-1",
            payment_method="dogecoin",
        )

    assert "json" not in captured

@pytest.mark.asyncio
async def test_create_invoice_default_bitcoin_constrains_btc_chain(monkeypatch):
    captured = _capture_post(monkeypatch)

    await btcpay.create_invoice(
        amount=Decimal("10.00"),
        currency="USD",
        order_id="BM-DEFAULT-RAIL-TEST",
        description="Default Bitcoin checkout",
        user_id="user-1",
    )

    assert captured["json"]["checkout"]["paymentMethods"] == ["BTC-CHAIN"]
    assert captured["json"]["checkout"]["defaultPaymentMethod"] == "BTC-CHAIN"


@pytest.mark.asyncio
async def test_btc_and_xmr_rails_never_cross(monkeypatch):
    captured = _capture_post(monkeypatch)

    await btcpay.create_invoice(
        amount=Decimal("10.00"),
        currency="USD",
        order_id="BM-BTC-RAIL-TEST",
        description="Bitcoin checkout",
        user_id="user-1",
        payment_method="bitcoin",
    )
    btc_checkout = dict(captured["json"]["checkout"])

    await btcpay.create_invoice(
        amount=Decimal("10.00"),
        currency="USD",
        order_id="BM-XMR-RAIL-TEST",
        description="Monero checkout",
        user_id="user-1",
        payment_method="monero",
    )
    xmr_checkout = dict(captured["json"]["checkout"])

    assert btc_checkout["paymentMethods"] == ["BTC-CHAIN"]
    assert btc_checkout["defaultPaymentMethod"] == "BTC-CHAIN"
    assert "XMR-CHAIN" not in btc_checkout["paymentMethods"]

    assert xmr_checkout["paymentMethods"] == ["XMR-CHAIN"]
    assert xmr_checkout["defaultPaymentMethod"] == "XMR-CHAIN"
    assert "BTC-CHAIN" not in xmr_checkout["paymentMethods"]
