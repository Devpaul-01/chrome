from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.services.payment_plans import get_payment_plan, list_payment_plans


@pytest.fixture
def configured_prices(monkeypatch):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", "9.99")
    monkeypatch.setenv("BTCPAY_PRICE_3_MONTH", "27.99")
    monkeypatch.setenv("BTCPAY_PRICE_6_MONTH", "53.99")
    monkeypatch.setenv("BTCPAY_PRICE_YEARLY", "99.99")
    monkeypatch.setenv("BTCPAY_CURRENCY", "usd")


@pytest.mark.parametrize(
    ("code", "amount", "term_months"),
    [
        ("monthly", Decimal("9.99"), 1),
        ("quarterly", Decimal("27.99"), 3),
        ("semiannual", Decimal("53.99"), 6),
        ("yearly", Decimal("99.99"), 12),
    ],
)
def test_supported_plans_are_server_controlled(
    configured_prices,
    code,
    amount,
    term_months,
):
    plan = get_payment_plan(code)

    assert plan.code == code
    assert plan.amount == amount
    assert plan.currency == "USD"
    assert plan.term_months == term_months


def test_catalog_has_stable_1_3_6_12_month_order(configured_prices):
    plans = list_payment_plans()

    assert [plan.code for plan in plans] == [
        "monthly",
        "quarterly",
        "semiannual",
        "yearly",
    ]
    assert [plan.term_months for plan in plans] == [1, 3, 6, 12]


@pytest.mark.parametrize(
    "bad_code",
    [
        "",
        "weekly",
        "lifetime",
        "lifetime-for-one-dollar",
        "13_months",
    ],
)
def test_unsupported_plan_is_rejected(configured_prices, bad_code):
    with pytest.raises(HTTPException) as exc:
        get_payment_plan(bad_code)

    assert exc.value.status_code == 400


def test_non_string_plan_is_rejected(configured_prices):
    with pytest.raises(HTTPException) as exc:
        get_payment_plan(None)  # type: ignore[arg-type]

    assert exc.value.status_code == 400


@pytest.mark.parametrize(
    ("env_name", "plan_code"),
    [
        ("BTCPAY_PRICE_MONTHLY", "monthly"),
        ("BTCPAY_PRICE_3_MONTH", "quarterly"),
        ("BTCPAY_PRICE_6_MONTH", "semiannual"),
        ("BTCPAY_PRICE_YEARLY", "yearly"),
    ],
)
def test_missing_plan_price_fails_closed(
    configured_prices,
    monkeypatch,
    env_name,
    plan_code,
):
    monkeypatch.delenv(env_name, raising=False)

    with pytest.raises(HTTPException) as exc:
        get_payment_plan(plan_code)

    assert exc.value.status_code == 503


@pytest.mark.parametrize(
    "bad_value",
    [
        "0",
        "-1",
        "NaN",
        "Infinity",
        "abc",
        "1.999",
    ],
)
def test_invalid_price_fails_closed(configured_prices, monkeypatch, bad_value):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", bad_value)

    with pytest.raises(HTTPException) as exc:
        get_payment_plan("monthly")

    assert exc.value.status_code == 503


@pytest.mark.parametrize("bad_currency", ["", "US", "USDD", "12A", "$$$"])
def test_invalid_currency_fails_closed(
    configured_prices,
    monkeypatch,
    bad_currency,
):
    monkeypatch.setenv("BTCPAY_CURRENCY", bad_currency)

    with pytest.raises(HTTPException) as exc:
        get_payment_plan("monthly")

    assert exc.value.status_code == 503


def test_plan_code_normalization_is_safe(configured_prices):
    plan = get_payment_plan("  QUARTERLY  ")

    assert plan.code == "quarterly"
    assert plan.term_months == 3
