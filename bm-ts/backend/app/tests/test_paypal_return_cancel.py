from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.api.routers import payments


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDb:
    def __init__(self, value):
        self._value = value
        self.executed = False

    async def execute(self, _statement):
        self.executed = True
        return _ScalarResult(self._value)


@pytest.mark.asyncio
async def test_paypal_return_reports_confirmed_only_from_local_settlement():
    db = _FakeDb(SimpleNamespace(paid_at=datetime.now(timezone.utc)))
    response = await payments.paypal_browser_return(token="ORDER-SETTLED", db=db)
    body = response.body.decode()
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "Payment successful" in body
    assert "confirmed" in body
    assert db.executed is True


@pytest.mark.asyncio
async def test_paypal_return_does_not_treat_redirect_as_payment_proof():
    db = _FakeDb(SimpleNamespace(paid_at=None))
    response = await payments.paypal_browser_return(token="ORDER-PENDING", db=db)
    body = response.body.decode()
    assert response.status_code == 200
    assert "Payment approval received" in body
    assert "securely confirming" in body
    assert "Payment successful" not in body


@pytest.mark.asyncio
async def test_paypal_return_without_token_is_pending_and_does_not_query_db():
    db = _FakeDb(None)
    response = await payments.paypal_browser_return(token=None, db=db)
    assert response.status_code == 200
    assert "Payment approval received" in response.body.decode()
    assert db.executed is False


@pytest.mark.asyncio
async def test_paypal_cancel_is_informational_and_never_settles():
    response = await payments.paypal_browser_cancel()
    body = response.body.decode()
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "PayPal checkout canceled" in body
    assert "No payment is confirmed by this page" in body
