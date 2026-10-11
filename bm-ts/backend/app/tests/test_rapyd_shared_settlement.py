from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.db.models import AccessEntitlement, PaymentTransaction
from app.services.rapyd_settlement import settle_rapyd_payment_snapshot


async def _tx(db, user, *, amount="9.70", status="NEW"):
    now = datetime.now(timezone.utc)
    tx = PaymentTransaction(
        id=uuid4(),
        user_id=user.id,
        provider="rapyd",
        provider_payment_id=None,
        provider_order_id=f"BM-RAPYD-{uuid4()}",
        amount=Decimal(amount),
        currency="USD",
        status=status,
        checkout_url="https://checkout.example.test",
        payment_method="rapyd_hosted_checkout",
        plan_code="monthly",
        paid_at=None,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={
            "billing_term_months": 1,
            "rapyd_checkout_id": f"checkout_{uuid4().hex}",
        },
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx


def _payment(tx, **changes):
    value = {
        "id": f"payment_{uuid4().hex}",
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
async def test_full_payment_settles_and_grants(db_session, test_user):
    tx = await _tx(db_session, test_user)
    payment = _payment(tx)

    result = await settle_rapyd_payment_snapshot(
        db=db_session,
        payment=payment,
        source="reconciliation",
    )
    await db_session.commit()
    await db_session.refresh(tx)

    assert result["settled"] is True
    assert tx.status == "Settled"
    assert tx.provider_payment_id == payment["id"]
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
async def test_nonfinal_or_mismatched_payment_never_grants(
    db_session, test_user, changes
):
    tx = await _tx(db_session, test_user)
    payment = _payment(tx, **changes)

    result = await settle_rapyd_payment_snapshot(
        db=db_session,
        payment=payment,
        source="reconciliation",
    )
    await db_session.commit()
    await db_session.refresh(tx)

    assert result["settled"] is False
    assert tx.paid_at is None
    assert tx.provider_payment_id is None

    count = await db_session.scalar(
        select(func.count())
        .select_from(AccessEntitlement)
        .where(AccessEntitlement.source_transaction_id == tx.id)
    )
    assert count == 0


@pytest.mark.asyncio
async def test_wrong_reference_never_binds(db_session, test_user):
    tx = await _tx(db_session, test_user)
    payment = _payment(tx, merchant_reference_id="BM-RAPYD-not-ours")

    result = await settle_rapyd_payment_snapshot(
        db=db_session,
        payment=payment,
        source="reconciliation",
    )

    assert result["settled"] is False
    assert result["reason"] == "payment_not_found"


@pytest.mark.asyncio
async def test_duplicate_same_payment_is_idempotent(db_session, test_user):
    tx = await _tx(db_session, test_user)
    payment = _payment(tx)

    first = await settle_rapyd_payment_snapshot(
        db=db_session,
        payment=payment,
        source="reconciliation",
    )
    await db_session.commit()

    second = await settle_rapyd_payment_snapshot(
        db=db_session,
        payment=payment,
        source="webhook",
    )
    await db_session.commit()

    assert first["settled"] is True
    assert second["settled"] is True

    count = await db_session.scalar(
        select(func.count())
        .select_from(AccessEntitlement)
        .where(AccessEntitlement.source_transaction_id == tx.id)
    )
    assert count == 1
