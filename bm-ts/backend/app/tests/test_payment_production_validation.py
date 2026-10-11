from types import SimpleNamespace

import pytest

from app.services.payment_production_validation import validate_payment_production_config


def _settings():
    return SimpleNamespace(
        database_url="postgresql+asyncpg://user:pass@db:5432/app",
        btcpay_url="https://btcpay.example.test",
        btcpay_public_url="https://btcpay.example.test",
        btcpay_store_id="store-123",
        btcpay_api_key="api-key-12345678901234567890",
        btcpay_webhook_secret="webhook-secret-123456789012345",
        rapyd_base_url="https://sandboxapi.rapyd.net",
        rapyd_access_key="rapyd-access-key-test",
        rapyd_secret_key="rapyd-secret-key-test-123456789",
        rapyd_webhook_url="https://api.example.test/api/payments/rapyd/webhook",
    )


def _production_env(monkeypatch):
    monkeypatch.setenv("APP_ENVIRONMENT", "production")
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", "10.00")
    monkeypatch.setenv("BTCPAY_PRICE_3_MONTH", "27.00")
    monkeypatch.setenv("BTCPAY_PRICE_6_MONTH", "50.00")
    monkeypatch.setenv("BTCPAY_PRICE_YEARLY", "90.00")
    monkeypatch.setenv("BTCPAY_CURRENCY", "USD")
    monkeypatch.setenv("PAYMENT_CHECKOUT_RECOVERY_BATCH_SIZE", "50")
    monkeypatch.setenv("PAYMENT_CHECKOUT_RECOVERY_INTERVAL_SECONDS", "60")
    monkeypatch.setenv("PAYMENT_CHECKOUT_RECOVERY_STALE_SECONDS", "120")
    monkeypatch.setenv("RAPYD_RECONCILIATION_WORKER_BATCH_SIZE", "50")
    monkeypatch.setenv("RAPYD_RECONCILIATION_WORKER_INTERVAL_SECONDS", "60")


def test_development_environment_does_not_require_production_payment_config(monkeypatch):
    monkeypatch.setenv("APP_ENVIRONMENT", "development")
    validate_payment_production_config(SimpleNamespace())


def test_complete_production_config_passes(monkeypatch):
    _production_env(monkeypatch)
    validate_payment_production_config(_settings())


def test_production_config_fails_closed_when_secrets_prices_and_url_are_bad(monkeypatch):
    _production_env(monkeypatch)
    monkeypatch.setenv("BTCPAY_PRICE_3_MONTH", "0")
    # Settings resolution intentionally falls back to environment variables.
    # Clear any real local BTCPay values so this negative test remains isolated
    # and cannot accidentally read the developer's configured secrets.
    monkeypatch.delenv("BTCPAY_URL", raising=False)
    monkeypatch.delenv("BTCPAY_API_KEY", raising=False)
    monkeypatch.delenv("BTCPAY_WEBHOOK_SECRET", raising=False)

    bad = _settings()
    bad.btcpay_url = "http://localhost:23000"
    bad.btcpay_api_key = ""
    bad.btcpay_webhook_secret = ""

    with pytest.raises(RuntimeError) as exc:
        validate_payment_production_config(bad)

    message = str(exc.value)
    assert "BTCPAY_URL" in message
    assert "BTCPAY_API_KEY" in message
    assert "BTCPAY_WEBHOOK_SECRET" in message
    assert "BTCPAY_PRICE_3_MONTH" in message


def test_production_config_rejects_sqlite(monkeypatch):
    _production_env(monkeypatch)
    bad = _settings()
    bad.database_url = "sqlite+aiosqlite:///./app.db"

    with pytest.raises(RuntimeError, match="PostgreSQL"):
        validate_payment_production_config(bad)


def test_internal_btcpay_api_url_is_allowed_with_safe_public_url(monkeypatch):
    _production_env(monkeypatch)
    cfg = _settings()
    cfg.btcpay_url = "http://btcpay:49393"
    cfg.btcpay_public_url = "https://btcpay.example.test"
    validate_payment_production_config(cfg)


def test_internal_public_checkout_url_is_rejected(monkeypatch):
    _production_env(monkeypatch)
    cfg = _settings()
    cfg.btcpay_public_url = "http://host.docker.internal:49393"
    try:
        validate_payment_production_config(cfg)
    except RuntimeError as exc:
        assert "BTCPAY_PUBLIC_URL" in str(exc)
    else:
        raise AssertionError("unsafe BTCPAY_PUBLIC_URL was accepted")


def test_production_config_fails_closed_when_rapyd_config_is_incomplete(monkeypatch):
    _production_env(monkeypatch)
    bad = _settings()
    bad.rapyd_base_url = "http://localhost:8080"
    bad.rapyd_access_key = ""
    bad.rapyd_secret_key = ""
    bad.rapyd_webhook_url = ""

    with pytest.raises(RuntimeError) as exc:
        validate_payment_production_config(bad)

    message = str(exc.value)
    assert "RAPYD_BASE_URL" in message
    assert "RAPYD_ACCESS_KEY" in message
    assert "RAPYD_SECRET_KEY" in message
    assert "RAPYD_WEBHOOK_URL" in message


def test_production_config_rejects_non_https_rapyd_webhook(monkeypatch):
    _production_env(monkeypatch)
    bad = _settings()
    bad.rapyd_webhook_url = "http://api.example.test/api/payments/rapyd/webhook"
    with pytest.raises(RuntimeError, match="RAPYD_WEBHOOK_URL"):
        validate_payment_production_config(bad)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("RAPYD_RECONCILIATION_WORKER_BATCH_SIZE", "0"),
        ("RAPYD_RECONCILIATION_WORKER_BATCH_SIZE", "501"),
        ("RAPYD_RECONCILIATION_WORKER_BATCH_SIZE", "not-an-int"),
        ("RAPYD_RECONCILIATION_WORKER_INTERVAL_SECONDS", "0"),
        ("RAPYD_RECONCILIATION_WORKER_INTERVAL_SECONDS", "3601"),
        ("RAPYD_RECONCILIATION_WORKER_INTERVAL_SECONDS", "not-an-int"),
    ],
)
def test_production_config_rejects_invalid_rapyd_reconciliation_worker_settings(
    monkeypatch, name, value
):
    _production_env(monkeypatch)
    monkeypatch.setenv(name, value)

    with pytest.raises(RuntimeError) as exc:
        validate_payment_production_config(_settings())

    assert name in str(exc.value)
