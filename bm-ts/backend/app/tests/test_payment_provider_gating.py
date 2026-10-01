from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.responses import Response

from app.api.routers import payments
from app.services import rapyd_reconciliation_worker
from app.services.payment_production_validation import validate_payment_production_config


def _production_env(monkeypatch):
    monkeypatch.setenv("APP_ENVIRONMENT", "production")
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", "9.70")
    monkeypatch.setenv("BTCPAY_PRICE_3_MONTH", "27.00")
    monkeypatch.setenv("BTCPAY_PRICE_6_MONTH", "50.00")
    monkeypatch.setenv("BTCPAY_PRICE_YEARLY", "97.00")
    monkeypatch.setenv("BTCPAY_CURRENCY", "USD")
    monkeypatch.setenv("PAYMENT_CHECKOUT_RECOVERY_BATCH_SIZE", "50")
    monkeypatch.setenv("PAYMENT_CHECKOUT_RECOVERY_INTERVAL_SECONDS", "60")
    monkeypatch.setenv("PAYMENT_CHECKOUT_RECOVERY_STALE_SECONDS", "120")


def _fake(length: int) -> str:
    return "x" * length


def _settings(*, paypal_enabled=True, rapyd_enabled=False):
    return SimpleNamespace(
        database_url="postgresql+asyncpg://user:pass@db:5432/app",
        btcpay_enabled=True,
        btcpay_url="https://btcpay.example.test",
        btcpay_public_url="https://btcpay.example.test",
        btcpay_store_id="store-123",
        btcpay_api_key=_fake(32),
        btcpay_webhook_secret=_fake(32),
        rapyd_enabled=rapyd_enabled,
        rapyd_base_url="",
        rapyd_access_key="",
        rapyd_secret_key="",
        rapyd_webhook_url="",
        paypal_enabled=paypal_enabled,
        paypal_environment="sandbox",
        paypal_client_id=_fake(24),
        paypal_client_secret=_fake(32),
        paypal_webhook_id="WH-" + _fake(16),
        paypal_return_url="https://staging.example.test/payment/paypal/return",
        paypal_cancel_url="https://staging.example.test/payment/paypal/cancel",
    )


def test_sandbox_policy_allows_paypal_with_rapyd_disabled(monkeypatch):
    _production_env(monkeypatch)
    monkeypatch.setenv("RAPYD_RECONCILIATION_WORKER_BATCH_SIZE", "not-an-int")
    monkeypatch.setenv("RAPYD_RECONCILIATION_WORKER_INTERVAL_SECONDS", "not-an-int")
    validate_payment_production_config(_settings())


def test_paypal_disabled_does_not_require_paypal_configuration(monkeypatch):
    _production_env(monkeypatch)
    cfg = _settings(paypal_enabled=False)
    cfg.paypal_environment = "invalid"
    cfg.paypal_client_id = ""
    cfg.paypal_client_secret = ""
    cfg.paypal_webhook_id = ""
    cfg.paypal_return_url = ""
    cfg.paypal_cancel_url = ""
    validate_payment_production_config(cfg)


def test_paypal_enabled_fails_closed_when_required_configuration_is_missing(monkeypatch):
    _production_env(monkeypatch)
    cfg = _settings()
    cfg.paypal_client_id = ""
    cfg.paypal_client_secret = ""
    cfg.paypal_webhook_id = ""
    with pytest.raises(RuntimeError) as exc:
        validate_payment_production_config(cfg)
    message = str(exc.value)
    assert "PAYPAL_CLIENT_ID" in message
    assert "PAYPAL_CLIENT_SECRET" in message
    assert "PAYPAL_WEBHOOK_ID" in message


def test_paypal_enabled_rejects_unknown_environment(monkeypatch):
    _production_env(monkeypatch)
    cfg = _settings()
    cfg.paypal_environment = "invalid"
    with pytest.raises(RuntimeError, match="PAYPAL_ENVIRONMENT"):
        validate_payment_production_config(cfg)


def test_paypal_enabled_requires_public_https_redirects(monkeypatch):
    _production_env(monkeypatch)
    cfg = _settings()
    cfg.paypal_return_url = "http://localhost/paypal/return"
    cfg.paypal_cancel_url = "https://host.docker.internal/paypal/cancel"
    with pytest.raises(RuntimeError) as exc:
        validate_payment_production_config(cfg)
    message = str(exc.value)
    assert "PAYPAL_RETURN_URL" in message
    assert "PAYPAL_CANCEL_URL" in message


@pytest.mark.asyncio
async def test_paypal_routes_block_before_side_effects_when_disabled(monkeypatch):
    monkeypatch.setattr(payments.settings, "paypal_enabled", False)
    with pytest.raises(HTTPException) as checkout:
        await payments.create_paypal_checkout(
            payload=None,
            response=Response(),
            idempotency_key="provider-gate-test-key",
            current_user=None,
            db=None,
        )
    assert checkout.value.status_code == 503
    with pytest.raises(HTTPException) as webhook:
        await payments.paypal_webhook(request=None, db=None)
    assert webhook.value.status_code == 503


@pytest.mark.asyncio
async def test_rapyd_routes_block_before_side_effects_when_disabled(monkeypatch):
    monkeypatch.setattr(payments.settings, "rapyd_enabled", False)
    with pytest.raises(HTTPException) as checkout:
        await payments.create_rapyd_checkout(
            payload=None,
            response=Response(),
            idempotency_key="provider-gate-test-key",
            current_user=None,
            db=None,
        )
    assert checkout.value.status_code == 503
    with pytest.raises(HTTPException) as webhook:
        await payments.rapyd_webhook(request=None, db=None)
    assert webhook.value.status_code == 503


@pytest.mark.asyncio
async def test_rapyd_worker_noops_without_provider_or_database_access_when_disabled(monkeypatch):
    monkeypatch.setattr(rapyd_reconciliation_worker.settings, "rapyd_enabled", False)
    reconcile = AsyncMock(side_effect=AssertionError("disabled worker touched Rapyd reconciliation"))
    monkeypatch.setattr(rapyd_reconciliation_worker, "process_reconciliation_jobs", reconcile)
    result = await rapyd_reconciliation_worker.run_once(limit=10)
    assert result == {"processed": 0, "disabled": 1}
    reconcile.assert_not_awaited()


@pytest.mark.asyncio
async def test_rapyd_worker_loop_exits_without_database_access_when_disabled(monkeypatch):
    monkeypatch.setattr(rapyd_reconciliation_worker.settings, "rapyd_enabled", False)
    monkeypatch.setattr(
        rapyd_reconciliation_worker,
        "AsyncSessionLocal",
        lambda: (_ for _ in ()).throw(AssertionError("disabled worker touched database")),
    )
    await rapyd_reconciliation_worker.run_forever(limit=10, interval=1)
