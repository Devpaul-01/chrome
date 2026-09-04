"""Server-controlled BirthdayMessaging payment plan catalog.

The client is allowed to select only a supported plan code. Price, currency,
entitlement duration, and product description are authoritative backend data.

Supported production terms:
    monthly      -> 1 month
    quarterly    -> 3 months
    semiannual   -> 6 months
    yearly       -> 12 months

Production prices are supplied through environment variables:
    BTCPAY_PRICE_MONTHLY
    BTCPAY_PRICE_3_MONTH
    BTCPAY_PRICE_6_MONTH
    BTCPAY_PRICE_YEARLY
    BTCPAY_CURRENCY

Missing, malformed, zero, negative, non-finite, or over-precision prices fail
closed. The browser never supplies an authoritative amount.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Final

from fastapi import HTTPException, status


@dataclass(frozen=True, slots=True)
class PaymentPlan:
    code: str
    display_name: str
    amount: Decimal
    currency: str
    term_months: int
    price_env_name: str


_PLAN_DEFINITIONS: Final[dict[str, tuple[str, str, int]]] = {
    "monthly": (
        "BirthdayMessaging Monthly",
        "BTCPAY_PRICE_MONTHLY",
        1,
    ),
    "quarterly": (
        "BirthdayMessaging 3 Months",
        "BTCPAY_PRICE_3_MONTH",
        3,
    ),
    "semiannual": (
        "BirthdayMessaging 6 Months",
        "BTCPAY_PRICE_6_MONTH",
        6,
    ),
    "yearly": (
        "BirthdayMessaging Yearly",
        "BTCPAY_PRICE_YEARLY",
        12,
    ),
}

_SUPPORTED_PLAN_CODES: Final[tuple[str, ...]] = tuple(_PLAN_DEFINITIONS.keys())


def _service_unavailable(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=detail,
    )


def _read_positive_money(env_name: str) -> Decimal:
    raw = os.getenv(env_name, "").strip()

    if not raw:
        raise _service_unavailable(
            f"Production payment plan configuration is incomplete: {env_name}."
        )

    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise _service_unavailable(
            f"Production payment plan configuration is invalid: {env_name}."
        ) from exc

    if not value.is_finite() or value <= 0:
        raise _service_unavailable(
            f"Production payment plan configuration is invalid: {env_name}."
        )

    # Money configuration must already be expressed to cents. Silently rounding
    # production pricing would hide configuration mistakes.
    if value.as_tuple().exponent < -2:
        raise _service_unavailable(
            f"Production payment plan configuration has too many decimal places: {env_name}."
        )

    return value.quantize(Decimal("0.01"))


def _currency() -> str:
    currency = os.getenv("BTCPAY_CURRENCY", "USD").strip().upper()

    if len(currency) != 3 or not currency.isalpha():
        raise _service_unavailable(
            "Production payment plan configuration is invalid: BTCPAY_CURRENCY."
        )

    return currency


def get_payment_plan(plan_code: str) -> PaymentPlan:
    """Resolve a client-selected plan code to authoritative server pricing."""
    if not isinstance(plan_code, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported payment plan.",
        )

    normalized = plan_code.strip().lower()

    definition = _PLAN_DEFINITIONS.get(normalized)
    if definition is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported payment plan.",
        )

    display_name, env_name, term_months = definition

    return PaymentPlan(
        code=normalized,
        display_name=display_name,
        amount=_read_positive_money(env_name),
        currency=_currency(),
        term_months=term_months,
        price_env_name=env_name,
    )


def list_payment_plans() -> tuple[PaymentPlan, ...]:
    """Return all configured production plans in stable display order."""
    return tuple(get_payment_plan(code) for code in _SUPPORTED_PLAN_CODES)
