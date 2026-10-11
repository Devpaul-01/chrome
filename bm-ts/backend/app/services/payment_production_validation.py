"""Fail-closed production validation for payment providers."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse
import os
import re
from typing import Any


_PRODUCTION_NAMES = {"prod", "production"}
_REQUIRED_PRICE_VARS = (
    "BTCPAY_PRICE_MONTHLY",
    "BTCPAY_PRICE_3_MONTH",
    "BTCPAY_PRICE_6_MONTH",
    "BTCPAY_PRICE_YEARLY",
)


def _text(settings: Any, attribute: str, env_name: str) -> str:
    value = getattr(settings, attribute, None)
    if value is not None and str(value).strip():
        return str(value).strip()
    return os.getenv(env_name, "").strip()


def _positive_decimal(name: str, value: str, errors: list[str]) -> None:
    try:
        parsed = Decimal(value)
    except (InvalidOperation, ValueError):
        errors.append(f"{name} must be a valid positive decimal amount.")
        return
    if parsed <= 0:
        errors.append(f"{name} must be greater than zero.")


def _enabled(settings: Any, attribute: str, *, legacy_default: bool) -> bool:
    """Resolve a provider gate without silently weakening legacy validation."""
    value = getattr(settings, attribute, None)
    if value is None:
        return legacy_default
    return bool(value)


def _public_https_url(name: str, value: str, errors: list[str]) -> None:
    parsed = urlparse(value) if value else None
    host = (parsed.hostname or "").lower() if parsed else ""
    if (
        parsed is None
        or parsed.scheme.lower() != "https"
        or not host
        or host in {"localhost", "127.0.0.1", "::1"}
        or host.endswith(".local")
        or host.startswith("host.docker.")
    ):
        errors.append(f"{name} must be a public HTTPS URL.")


def validate_payment_production_config(settings: Any) -> None:
    """Raise RuntimeError when production payment configuration is unsafe.

    Development and test environments are intentionally unaffected. Production
    mode is explicit through APP_ENVIRONMENT=production/prod.
    """
    environment = os.getenv("APP_ENVIRONMENT", "development").strip().lower()
    if environment not in _PRODUCTION_NAMES:
        return

    errors: list[str] = []

    database_url = _text(settings, "database_url", "DATABASE_URL")
    if not database_url.startswith(("postgresql://", "postgresql+asyncpg://")):
        errors.append("DATABASE_URL must use PostgreSQL in production.")

    btcpay_url = _text(settings, "btcpay_url", "BTCPAY_URL")
    parsed = urlparse(btcpay_url) if btcpay_url else None
    if (
        parsed is None
        or parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}
    ):
        errors.append("BTCPAY_URL must be a valid server-to-server HTTP(S) URL.")

    btcpay_public_url = _text(settings, "btcpay_public_url", "BTCPAY_PUBLIC_URL")
    public_parsed = urlparse(btcpay_public_url) if btcpay_public_url else None
    public_host = (public_parsed.hostname or "").lower() if public_parsed else ""
    if (
        public_parsed is None
        or public_parsed.scheme.lower() != "https"
        or not public_host
        or public_host in {"localhost", "127.0.0.1", "::1"}
        or public_host.endswith(".local")
        or public_host.startswith("host.docker.")
    ):
        errors.append("BTCPAY_PUBLIC_URL must be a browser-accessible HTTPS URL.")

    if not _text(settings, "btcpay_store_id", "BTCPAY_STORE_ID"):
        errors.append("BTCPAY_STORE_ID is required.")

    api_key = _text(settings, "btcpay_api_key", "BTCPAY_API_KEY")
    if len(api_key) < 16:
        errors.append("BTCPAY_API_KEY is missing or implausibly short.")

    webhook_secret = _text(settings, "btcpay_webhook_secret", "BTCPAY_WEBHOOK_SECRET")
    if len(webhook_secret) < 16:
        errors.append("BTCPAY_WEBHOOK_SECRET is missing or implausibly short.")

    rapyd_enabled = _enabled(settings, "rapyd_enabled", legacy_default=True)
    paypal_enabled = _enabled(settings, "paypal_enabled", legacy_default=False)

    if rapyd_enabled:
        rapyd_base_url = _text(settings, "rapyd_base_url", "RAPYD_BASE_URL")
        rapyd_base = urlparse(rapyd_base_url) if rapyd_base_url else None
        rapyd_host = (rapyd_base.hostname or "").lower() if rapyd_base else ""
        if (
            rapyd_base is None
            or rapyd_base.scheme.lower() != "https"
            or not rapyd_host
            or rapyd_host in {"localhost", "127.0.0.1", "::1"}
            or rapyd_host.endswith(".local")
        ):
            errors.append("RAPYD_BASE_URL must be a valid HTTPS provider URL.")

        rapyd_access_key = _text(settings, "rapyd_access_key", "RAPYD_ACCESS_KEY")
        if len(rapyd_access_key) < 8:
            errors.append("RAPYD_ACCESS_KEY is missing or implausibly short.")

        rapyd_secret_key = _text(settings, "rapyd_secret_key", "RAPYD_SECRET_KEY")
        if len(rapyd_secret_key) < 16:
            errors.append("RAPYD_SECRET_KEY is missing or implausibly short.")

        rapyd_webhook_url = _text(settings, "rapyd_webhook_url", "RAPYD_WEBHOOK_URL")
        _public_https_url("RAPYD_WEBHOOK_URL", rapyd_webhook_url, errors)

    if paypal_enabled:
        paypal_environment = _text(settings, "paypal_environment", "PAYPAL_ENVIRONMENT").lower()
        if paypal_environment not in {"sandbox", "live"}:
            errors.append("PAYPAL_ENVIRONMENT must be sandbox or live.")

        paypal_client_id = _text(settings, "paypal_client_id", "PAYPAL_CLIENT_ID")
        if len(paypal_client_id) < 8:
            errors.append("PAYPAL_CLIENT_ID is missing or implausibly short.")

        paypal_client_secret = _text(settings, "paypal_client_secret", "PAYPAL_CLIENT_SECRET")
        if len(paypal_client_secret) < 16:
            errors.append("PAYPAL_CLIENT_SECRET is missing or implausibly short.")

        paypal_webhook_id = _text(settings, "paypal_webhook_id", "PAYPAL_WEBHOOK_ID")
        if len(paypal_webhook_id) < 8:
            errors.append("PAYPAL_WEBHOOK_ID is missing or implausibly short.")

        paypal_return_url = _text(settings, "paypal_return_url", "PAYPAL_RETURN_URL")
        _public_https_url("PAYPAL_RETURN_URL", paypal_return_url, errors)

        paypal_cancel_url = _text(settings, "paypal_cancel_url", "PAYPAL_CANCEL_URL")
        _public_https_url("PAYPAL_CANCEL_URL", paypal_cancel_url, errors)

    for name in _REQUIRED_PRICE_VARS:
        value = os.getenv(name, "").strip()
        if not value:
            errors.append(f"{name} is required.")
        else:
            _positive_decimal(name, value, errors)

    currency = os.getenv("BTCPAY_CURRENCY", "").strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", currency):
        errors.append("BTCPAY_CURRENCY must be a three-letter ISO-style currency code.")

    batch = os.getenv("PAYMENT_CHECKOUT_RECOVERY_BATCH_SIZE", "50").strip()
    interval = os.getenv("PAYMENT_CHECKOUT_RECOVERY_INTERVAL_SECONDS", "60").strip()
    stale = os.getenv("PAYMENT_CHECKOUT_RECOVERY_STALE_SECONDS", "120").strip()
    worker_settings = [
        ("PAYMENT_CHECKOUT_RECOVERY_BATCH_SIZE", batch, 1, 500),
        ("PAYMENT_CHECKOUT_RECOVERY_INTERVAL_SECONDS", interval, 5, 3600),
        ("PAYMENT_CHECKOUT_RECOVERY_STALE_SECONDS", stale, 30, 86400),
    ]
    if rapyd_enabled:
        worker_settings.extend(
            [
                (
                    "RAPYD_RECONCILIATION_WORKER_BATCH_SIZE",
                    os.getenv("RAPYD_RECONCILIATION_WORKER_BATCH_SIZE", "50").strip(),
                    1,
                    500,
                ),
                (
                    "RAPYD_RECONCILIATION_WORKER_INTERVAL_SECONDS",
                    os.getenv("RAPYD_RECONCILIATION_WORKER_INTERVAL_SECONDS", "60").strip(),
                    1,
                    3600,
                ),
            ]
        )

    for name, raw, minimum, maximum in worker_settings:
        try:
            parsed_int = int(raw)
        except ValueError:
            errors.append(f"{name} must be an integer.")
            continue
        if not minimum <= parsed_int <= maximum:
            errors.append(f"{name} must be between {minimum} and {maximum}.")

    if errors:
        message = "Unsafe production payment configuration:\n- " + "\n- ".join(errors)
        raise RuntimeError(message)
