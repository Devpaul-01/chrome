from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.db.models import (
    AccessEntitlement,
    PaymentCheckoutAttempt,
    PaymentTransaction,
)
from app.services import rapyd
from app.services.rapyd_reconciliation import (
    RapydReconciliationError,
    reconcile_rapyd_transaction,
)


async def _records(db, user):
    now = datetime.now(timezone.utc)
    attempt_id = uuid4()
    order = f"BM-RAPYD-{attempt_id}"
    attempt = PaymentCheckoutAttempt(
        id=attempt_id,
        user_id=user.id,
        provider="rapyd",
        idempotency_key=f"rapyd:{attempt_id}",
        plan_code="monthly",
        amount=Decimal("9.70"),
        currency="USD",
        metadata_payload={},
        provider_order_id=order,
        provider_payment_id=f"checkout_{uuid4().hex}",
        status="completed",
        created_at=now,
        updated_at=now,
    )
    tx = PaymentTransaction(
        id=uuid4(),
        user_id=user.id,
        checkout_attempt_id=attempt.id,
        provider="rapyd",
        provider_payment_id=None,
        provider_order_id=order,
        amount=Decimal("9.70"),
        currency="USD",
        status="NEW",
        checkout_url="https://checkout.example.test",
        payment_method="rapyd_hosted_checkout",
        plan_code="monthly",
        paid_at=None,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 1},
    )
    db.add_all([attempt, tx])
    await db.commit()
    return attempt, tx


def _payment(tx, payment_id, **changes):
    value = {
        "id": payment_id,
        "merchant_reference_id": tx.provider_order_id,
        "status": "CLO",
        "paid": True,
        "is_partial": False,
        "original_amount": 9.70,
        "currency_code": "USD",
    }
    value.update(changes)
    return value


@pytest.mark.asyncio
async def test_lost_webhook_reconciliation_settles_once(
    db_session, test_user, monkeypatch
):
    attempt, tx = await _records(db_session, test_user)
    pid = f"payment_{uuid4().hex}"

    async def checkout(_):
        return {"id": attempt.provider_payment_id, "status": "DON", "payment": {"id": pid}}

    async def payment(_):
        return _payment(tx, pid)

    monkeypatch.setattr(rapyd, "retrieve_checkout", checkout)
    monkeypatch.setattr(rapyd, "retrieve_payment", payment)

    first = await reconcile_rapyd_transaction(db=db_session, transaction_id=tx.id)
    second = await reconcile_rapyd_transaction(db=db_session, transaction_id=tx.id)

    await db_session.refresh(tx)
    assert first["reconciled"] is True
    assert second["reason"] == "already_settled"
    assert tx.status == "Settled"
    assert tx.provider_payment_id == pid
    assert tx.paid_at is not None

    count = await db_session.scalar(
        select(func.count())
        .select_from(AccessEntitlement)
        .where(AccessEntitlement.source_transaction_id == tx.id)
    )
    assert count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "changes",
    [
        {"paid": False},
        {"is_partial": True},
        {"status": "ACT"},
        {"original_amount": 9.69},
        {"original_amount": 9.71},
        {"currency_code": "EUR"},
    ],
)
async def test_reconciliation_fails_closed_for_nonfinal_financial_truth(
    db_session, test_user, monkeypatch, changes
):
    attempt, tx = await _records(db_session, test_user)
    pid = f"payment_{uuid4().hex}"

    async def checkout(_):
        return {"payment": {"id": pid}}

    async def payment(_):
        return _payment(tx, pid, **changes)

    monkeypatch.setattr(rapyd, "retrieve_checkout", checkout)
    monkeypatch.setattr(rapyd, "retrieve_payment", payment)

    result = await reconcile_rapyd_transaction(db=db_session, transaction_id=tx.id)
    await db_session.refresh(tx)

    assert result["reconciled"] is False
    assert tx.paid_at is None
    assert tx.provider_payment_id is None

    count = await db_session.scalar(
        select(func.count())
        .select_from(AccessEntitlement)
        .where(AccessEntitlement.source_transaction_id == tx.id)
    )
    assert count == 0


@pytest.mark.asyncio
async def test_reference_mismatch_never_settles(
    db_session, test_user, monkeypatch
):
    attempt, tx = await _records(db_session, test_user)
    pid = f"payment_{uuid4().hex}"

    async def checkout(_):
        return {"payment": {"id": pid}}

    async def payment(_):
        return _payment(tx, pid, merchant_reference_id="BM-RAPYD-WRONG")

    monkeypatch.setattr(rapyd, "retrieve_checkout", checkout)
    monkeypatch.setattr(rapyd, "retrieve_payment", payment)

    result = await reconcile_rapyd_transaction(db=db_session, transaction_id=tx.id)

    assert result["reconciled"] is False
    assert result["reason"] == "merchant_reference_mismatch"


@pytest.mark.asyncio
async def test_network_failure_is_retryable_and_does_not_mutate(
    db_session, test_user, monkeypatch
):
    attempt, tx = await _records(db_session, test_user)

    async def fail(_):
        raise TimeoutError("simulated provider timeout")

    monkeypatch.setattr(rapyd, "retrieve_checkout", fail)

    with pytest.raises(TimeoutError):
        await reconcile_rapyd_transaction(db=db_session, transaction_id=tx.id)

    await db_session.rollback()
    await db_session.refresh(tx)

    assert tx.status == "NEW"
    assert tx.paid_at is None
    assert tx.provider_payment_id is None


@pytest.mark.asyncio
async def test_missing_payment_object_is_retryable_structural_failure(
    db_session, test_user, monkeypatch
):
    _, tx = await _records(db_session, test_user)

    async def checkout(_):
        return {"status": "DON", "payment": None}

    monkeypatch.setattr(rapyd, "retrieve_checkout", checkout)

    with pytest.raises(RapydReconciliationError):
        await reconcile_rapyd_transaction(db=db_session, transaction_id=tx.id)
