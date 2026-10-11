from decimal import Decimal
import pytest
from app.services import paypal
from app.services.paypal_settlement import _money

def test_paypal_money_normalizes_two_decimals():
    assert _money("9.7") == Decimal("9.70")

def test_paypal_money_rejects_excess_precision():
    with pytest.raises(ValueError):
        _money("9.701")

@pytest.mark.asyncio
async def test_paypal_webhook_requires_transmission_headers(monkeypatch):
    monkeypatch.setattr(paypal.settings, "paypal_webhook_id", "WH-TEST")
    with pytest.raises(paypal.PayPalWebhookAuthenticationError):
        await paypal.verify_webhook({}, {"id": "evt-1", "event_type": "PAYMENT.CAPTURE.COMPLETED"})
