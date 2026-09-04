from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routers import payments
from app.core.errors import AppError, ErrorCodes
from app.db.models import PaymentCheckoutAttempt, PaymentTransaction
from app.services.payment_plans import get_payment_plan


def _attempt(*, status="uncertain"):
    now = datetime.now(timezone.utc)
    return PaymentCheckoutAttempt(
        id=uuid4(),
        user_id=uuid4(),
        provider="btcpay",
        idempotency_key=str(uuid4()),
        plan_code="quarterly",
        amount=Decimal("27.00"),
        currency="USD",
        provider_order_id=f"BM-{uuid4()}",
        provider_payment_id=None,
        checkout_url=None,
        status=status,
        failure_code=None,
        claim_expires_at=now + timedelta(minutes=5),
        completed_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 3},
    )


def test_checkout_status_marks_uncertain_without_transaction_recoverable():
    attempt = _attempt(status="uncertain")

    body = payments._checkout_status_response(attempt, None)

    assert body.checkout_status == "uncertain"
    assert body.payment_status is None
    assert body.recoverable is True
    assert body.billing_term_months == 3


def test_checkout_status_marks_completed_transaction_not_recoverable():
    attempt = _attempt(status="completed")
    now = datetime.now(timezone.utc)
    tx = PaymentTransaction(
        id=uuid4(),
        user_id=attempt.user_id,
        provider="btcpay",
        provider_payment_id="invoice-1",
        provider_order_id=attempt.provider_order_id,
        checkout_attempt_id=attempt.id,
        amount=Decimal("27.00"),
        currency="USD",
        status="New",
        checkout_url="https://checkout.example.test/invoice-1",
        payment_method="bitcoin",
        plan_code="quarterly",
        paid_at=None,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 3},
    )

    body = payments._checkout_status_response(attempt, tx)

    assert body.payment_id == str(tx.id)
    assert body.provider_payment_id == "invoice-1"
    assert body.recoverable is False


def test_production_plan_catalog_still_resolves_all_terms(monkeypatch):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", "10.00")
    monkeypatch.setenv("BTCPAY_PRICE_3_MONTH", "27.00")
    monkeypatch.setenv("BTCPAY_PRICE_6_MONTH", "50.00")
    monkeypatch.setenv("BTCPAY_PRICE_YEARLY", "90.00")
    monkeypatch.setenv("BTCPAY_CURRENCY", "USD")

    assert get_payment_plan("monthly").term_months == 1
    assert get_payment_plan("quarterly").term_months == 3
    assert get_payment_plan("semiannual").term_months == 6
    assert get_payment_plan("yearly").term_months == 12
