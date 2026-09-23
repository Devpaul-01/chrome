from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.db.models import AccessEntitlement, PaymentTransaction
from app.services.entitlements import grant_entitlement_for_settled_payment


def _payment(user, *, provider: str, status: str = "Settled", paid: bool = True):
    now = datetime.now(timezone.utc)
    return PaymentTransaction(
        id=uuid4(),
        user_id=user.id,
        provider=provider,
        provider_payment_id=f"{provider}-{uuid4().hex}",
        provider_order_id=f"order-{uuid4().hex}",
        amount=Decimal("10.00"),
        currency="USD",
        status=status,
        checkout_url="https://checkout.example.test",
        payment_method=f"{provider}_test",
        plan_code="monthly",
        paid_at=now if paid else None,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 1},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["btcpay", "rapyd"])
async def test_supported_fully_settled_provider_grants_entitlement(
    db_session, test_user, provider
):
    payment = _payment(test_user, provider=provider)
    db_session.add(payment)
    await db_session.commit()
    entitlement = await grant_entitlement_for_settled_payment(
        db=db_session, transaction=payment
    )
    await db_session.commit()
    assert entitlement.source_provider == provider
    assert entitlement.source_payment_id == payment.provider_payment_id
    assert entitlement.source_transaction_id == payment.id
    assert entitlement.status == "ACTIVE"


@pytest.mark.asyncio
async def test_unsupported_provider_fails_closed(db_session, test_user):
    payment = _payment(test_user, provider="unsupported")
    db_session.add(payment)
    await db_session.commit()
    with pytest.raises(ValueError, match="unsupported payment provider"):
        await grant_entitlement_for_settled_payment(
            db=db_session, transaction=payment
        )


@pytest.mark.asyncio
async def test_unsettled_rapyd_payment_cannot_grant_entitlement(
    db_session, test_user
):
    payment = _payment(test_user, provider="rapyd", status="ACT", paid=False)
    db_session.add(payment)
    await db_session.commit()
    with pytest.raises(ValueError, match="fully settled"):
        await grant_entitlement_for_settled_payment(
            db=db_session, transaction=payment
        )


@pytest.mark.asyncio
async def test_rapyd_duplicate_grant_is_idempotent(db_session, test_user):
    payment = _payment(test_user, provider="rapyd")
    db_session.add(payment)
    await db_session.commit()
    first = await grant_entitlement_for_settled_payment(
        db=db_session, transaction=payment
    )
    await db_session.commit()
    second = await grant_entitlement_for_settled_payment(
        db=db_session, transaction=payment
    )
    await db_session.commit()
    assert first.id == second.id
    count = await db_session.scalar(
        select(func.count()).select_from(AccessEntitlement).where(
            AccessEntitlement.source_transaction_id == payment.id
        )
    )
    assert count == 1
