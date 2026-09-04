from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.subscription import get_status
from app.db.models import AccessEntitlement, User


@pytest.mark.asyncio
async def test_subscription_status_uses_active_provider_neutral_entitlement(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = datetime.now(timezone.utc)
    entitlement = AccessEntitlement(
        id=uuid.uuid4(),
        user_id=test_user.id,
        plan_code="monthly",
        status="ACTIVE",
        starts_at=now - timedelta(minutes=1),
        expires_at=now + timedelta(days=30),
        source_provider="btcpay",
        source_payment_id=f"invoice-{uuid.uuid4().hex}",
        source_transaction_id=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 1},
    )
    db_session.add(entitlement)
    await db_session.commit()

    result = await get_status(current_user=test_user, db=db_session)

    assert result.is_active is True
    assert result.plan == "monthly"
    assert result.status == "ACTIVE"
    assert result.current_period_end is not None
    assert result.stripe_customer_id is None
    assert result.stripe_subscription_id is None


@pytest.mark.asyncio
async def test_subscription_status_ignores_future_entitlement_until_it_starts(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = datetime.now(timezone.utc)
    entitlement = AccessEntitlement(
        id=uuid.uuid4(),
        user_id=test_user.id,
        plan_code="yearly",
        status="ACTIVE",
        starts_at=now + timedelta(days=1),
        expires_at=now + timedelta(days=366),
        source_provider="btcpay",
        source_payment_id=f"invoice-{uuid.uuid4().hex}",
        source_transaction_id=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 12},
    )
    db_session.add(entitlement)
    await db_session.commit()

    result = await get_status(current_user=test_user, db=db_session)

    assert result.is_active is False


@pytest.mark.asyncio
async def test_subscription_status_reports_contiguous_prepaid_renewals(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = datetime.now(timezone.utc)
    boundary_1 = now + timedelta(days=10)
    boundary_2 = now + timedelta(days=40)
    boundary_3 = now + timedelta(days=70)

    rows = [
        AccessEntitlement(
            id=uuid.uuid4(),
            user_id=test_user.id,
            plan_code="monthly",
            status="ACTIVE",
            starts_at=now - timedelta(days=20),
            expires_at=boundary_1,
            source_provider="btcpay",
            source_payment_id=f"invoice-{uuid.uuid4().hex}",
            source_transaction_id=None,
            created_at=now,
            updated_at=now,
            metadata_payload={"billing_term_months": 1},
        ),
        AccessEntitlement(
            id=uuid.uuid4(),
            user_id=test_user.id,
            plan_code="monthly",
            status="ACTIVE",
            starts_at=boundary_1,
            expires_at=boundary_2,
            source_provider="btcpay",
            source_payment_id=f"invoice-{uuid.uuid4().hex}",
            source_transaction_id=None,
            created_at=now,
            updated_at=now,
            metadata_payload={"billing_term_months": 1},
        ),
        AccessEntitlement(
            id=uuid.uuid4(),
            user_id=test_user.id,
            plan_code="monthly",
            status="ACTIVE",
            starts_at=boundary_2,
            expires_at=boundary_3,
            source_provider="btcpay",
            source_payment_id=f"invoice-{uuid.uuid4().hex}",
            source_transaction_id=None,
            created_at=now,
            updated_at=now,
            metadata_payload={"billing_term_months": 1},
        ),
    ]
    db_session.add_all(rows)
    await db_session.commit()

    result = await get_status(current_user=test_user, db=db_session)

    assert result.is_active is True
    assert result.plan == "monthly"
    assert result.current_period_end == boundary_3


@pytest.mark.asyncio
async def test_subscription_status_stops_paid_through_at_gap(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = datetime.now(timezone.utc)
    current_end = now + timedelta(days=10)

    current = AccessEntitlement(
        id=uuid.uuid4(),
        user_id=test_user.id,
        plan_code="monthly",
        status="ACTIVE",
        starts_at=now - timedelta(days=20),
        expires_at=current_end,
        source_provider="btcpay",
        source_payment_id=f"invoice-{uuid.uuid4().hex}",
        source_transaction_id=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 1},
    )
    future_after_gap = AccessEntitlement(
        id=uuid.uuid4(),
        user_id=test_user.id,
        plan_code="monthly",
        status="ACTIVE",
        starts_at=current_end + timedelta(days=2),
        expires_at=current_end + timedelta(days=32),
        source_provider="btcpay",
        source_payment_id=f"invoice-{uuid.uuid4().hex}",
        source_transaction_id=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 1},
    )
    db_session.add_all([current, future_after_gap])
    await db_session.commit()

    result = await get_status(current_user=test_user, db=db_session)

    assert result.is_active is True
    assert result.current_period_end == current_end


@pytest.mark.asyncio
async def test_subscription_status_ignores_revoked_future_extension(
    db_session: AsyncSession,
    test_user: User,
) -> None:
    now = datetime.now(timezone.utc)
    current_end = now + timedelta(days=10)

    current = AccessEntitlement(
        id=uuid.uuid4(),
        user_id=test_user.id,
        plan_code="monthly",
        status="ACTIVE",
        starts_at=now - timedelta(days=20),
        expires_at=current_end,
        source_provider="btcpay",
        source_payment_id=f"invoice-{uuid.uuid4().hex}",
        source_transaction_id=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 1},
    )
    revoked = AccessEntitlement(
        id=uuid.uuid4(),
        user_id=test_user.id,
        plan_code="monthly",
        status="REVOKED",
        starts_at=current_end,
        expires_at=current_end + timedelta(days=30),
        source_provider="btcpay",
        source_payment_id=f"invoice-{uuid.uuid4().hex}",
        source_transaction_id=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": 1},
    )
    db_session.add_all([current, revoked])
    await db_session.commit()

    result = await get_status(current_user=test_user, db=db_session)

    assert result.is_active is True
    assert result.current_period_end == current_end
