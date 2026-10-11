from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest
from sqlalchemy import select

from app.db.models import PaymentCheckoutAttempt, PaymentTransaction
from app.services import payment_checkout_recovery as recovery


def _now():
    return datetime.now(timezone.utc)


def _attempt(user, *, status="uncertain"):
    now = _now()
    return PaymentCheckoutAttempt(
        id=uuid.uuid4(),
        user_id=user.id,
        provider="btcpay",
        idempotency_key=str(uuid.uuid4()),
        plan_code="monthly",
        amount=Decimal("10.00"),
        currency="USD",
        provider_order_id=f"BM-{uuid.uuid4()}",
        provider_payment_id=None,
        checkout_url=None,
        status=status,
        failure_code=None,
        claim_expires_at=now - timedelta(minutes=5),
        completed_at=None,
        created_at=now - timedelta(minutes=10),
        updated_at=now - timedelta(minutes=5),
        metadata_payload={"billing_term_months": 1},
    )


@pytest.mark.asyncio
async def test_unresolved_recovery_never_creates_replacement_invoice(
    db_session, test_user, monkeypatch
):
    row = _attempt(test_user)
    db_session.add(row)
    await db_session.commit()

    calls = []

    async def no_invoice(order_id):
        calls.append(order_id)
        return None

    monkeypatch.setattr(recovery, "find_invoice_by_order_id", no_invoice)

    result = await recovery.recover_stale_btcpay_checkouts(
        db=db_session,
        now=_now(),
        limit=10,
    )
    await db_session.refresh(row)

    assert result["scanned"] == 1
    assert result["unresolved"] == 1
    assert result["recovered"] == 0
    assert calls == [row.provider_order_id]
    assert row.status == "uncertain"

    txs = (
        await db_session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.checkout_attempt_id == row.id
            )
        )
    ).scalars().all()
    assert txs == []


@pytest.mark.asyncio
async def test_existing_provider_invoice_is_recovered_into_one_local_payment(
    db_session, test_user, monkeypatch
):
    row = _attempt(test_user)
    db_session.add(row)
    await db_session.commit()

    async def existing_invoice(order_id):
        assert order_id == row.provider_order_id
        return {
            "id": f"invoice-{uuid.uuid4().hex}",
            "checkoutLink": "https://checkout.example.test/recovered",
            "status": "New",
            "metadata": {"orderId": order_id},
        }

    monkeypatch.setattr(recovery, "find_invoice_by_order_id", existing_invoice)
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", "10.00")
    monkeypatch.setenv("BTCPAY_PRICE_3_MONTH", "27.00")
    monkeypatch.setenv("BTCPAY_PRICE_6_MONTH", "50.00")
    monkeypatch.setenv("BTCPAY_PRICE_YEARLY", "90.00")
    monkeypatch.setenv("BTCPAY_CURRENCY", "USD")

    result = await recovery.recover_stale_btcpay_checkouts(
        db=db_session,
        now=_now(),
        limit=10,
    )

    assert result["recovered"] == 1
    txs = (
        await db_session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.checkout_attempt_id == row.id
            )
        )
    ).scalars().all()
    assert len(txs) == 1

    # A second pass cannot create a duplicate.
    second = await recovery.recover_stale_btcpay_checkouts(
        db=db_session,
        now=_now() + timedelta(minutes=10),
        limit=10,
    )
    txs2 = (
        await db_session.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.checkout_attempt_id == row.id
            )
        )
    ).scalars().all()
    assert len(txs2) == 1
