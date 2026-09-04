"""Fail-closed production validation for the BTCPay payment subsystem."""

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
        or parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.hostname.lower() in {"localhost", "127.0.0.1"}
    ):
        errors.append("BTCPAY_URL must be a valid non-local HTTPS URL.")

    if not _text(settings, "btcpay_store_id", "BTCPAY_STORE_ID"):
        errors.append("BTCPAY_STORE_ID is required.")

    api_key = _text(settings, "btcpay_api_key", "BTCPAY_API_KEY")
    if len(api_key) < 16:
        errors.append("BTCPAY_API_KEY is missing or implausibly short.")

    webhook_secret = _text(settings, "btcpay_webhook_secret", "BTCPAY_WEBHOOK_SECRET")
    if len(webhook_secret) < 16:
        errors.append("BTCPAY_WEBHOOK_SECRET is missing or implausibly short.")

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

    for name, raw, minimum, maximum in (
        ("PAYMENT_CHECKOUT_RECOVERY_BATCH_SIZE", batch, 1, 500),
        ("PAYMENT_CHECKOUT_RECOVERY_INTERVAL_SECONDS", interval, 5, 3600),
        ("PAYMENT_CHECKOUT_RECOVERY_STALE_SECONDS", stale, 30, 86400),
    ):
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
