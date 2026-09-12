"""Authorization tests for provider-neutral paid access entitlements."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

import pytest
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_active_entitlement
from app.core.errors import AppError, ErrorCodes
from app.db.models import AccessEntitlement, User


def _entitlement(
    user: User,
    *,
    starts_at: datetime,
    expires_at: datetime,
    entitlement_status: str = "ACTIVE",
    plan_code: str = "personal-monthly",
) -> AccessEntitlement:
    now = datetime.now(timezone.utc)
    return AccessEntitlement(
        id=uuid.uuid4(),
        user_id=user.id,
        plan_code=plan_code,
        status=entitlement_status,
        starts_at=starts_at,
        expires_at=expires_at,
        source_provider="btcpay",
        source_payment_id=f"invoice-{uuid.uuid4()}",
        source_transaction_id=None,
        created_at=now,
        updated_at=now,
        metadata_payload={},
    )


@pytest.mark.asyncio
async def test_no_entitlement_requires_subscription(
    db_session: AsyncSession, test_user: User
) -> None:
    with pytest.raises(AppError) as exc_info:
        await require_active_entitlement(current_user=test_user, db=db_session)

    exc = exc_info.value
    assert exc.status_code == status.HTTP_403_FORBIDDEN
    assert exc.code == ErrorCodes.SUBSCRIPTION_REQUIRED
    assert "active subscription" in exc.detail.lower()


@pytest.mark.asyncio
async def test_current_active_entitlement_grants_access(
    db_session: AsyncSession, test_user: User
) -> None:
    now = datetime.now(timezone.utc)
    expected = _entitlement(
        test_user,
        starts_at=now - timedelta(days=5),
        expires_at=now + timedelta(days=25),
    )
    db_session.add(expected)
    await db_session.commit()

    actual = await require_active_entitlement(current_user=test_user, db=db_session)

    assert actual.id == expected.id
    assert actual.user_id == test_user.id


@pytest.mark.asyncio
async def test_expired_entitlement_is_blocked_even_if_status_still_active(
    db_session: AsyncSession, test_user: User
) -> None:
    now = datetime.now(timezone.utc)
    db_session.add(
        _entitlement(
            test_user,
            starts_at=now - timedelta(days=40),
            expires_at=now - timedelta(seconds=1),
            entitlement_status="ACTIVE",
        )
    )
    await db_session.commit()

    with pytest.raises(AppError) as exc_info:
        await require_active_entitlement(current_user=test_user, db=db_session)

    exc = exc_info.value
    assert exc.status_code == status.HTTP_403_FORBIDDEN
    assert exc.code == ErrorCodes.SUBSCRIPTION_EXPIRED


@pytest.mark.asyncio
async def test_future_entitlement_does_not_grant_access_early(
    db_session: AsyncSession, test_user: User
) -> None:
    now = datetime.now(timezone.utc)
    db_session.add(
        _entitlement(
            test_user,
            starts_at=now + timedelta(days=3),
            expires_at=now + timedelta(days=33),
        )
    )
    await db_session.commit()

    with pytest.raises(AppError) as exc_info:
        await require_active_entitlement(current_user=test_user, db=db_session)

    exc = exc_info.value
    assert exc.status_code == status.HTTP_403_FORBIDDEN
    assert exc.code == ErrorCodes.SUBSCRIPTION_NOT_YET_ACTIVE


@pytest.mark.asyncio
async def test_inactive_entitlement_is_blocked(
    db_session: AsyncSession, test_user: User
) -> None:
    now = datetime.now(timezone.utc)
    db_session.add(
        _entitlement(
            test_user,
            starts_at=now - timedelta(days=2),
            expires_at=now + timedelta(days=28),
            entitlement_status="REVOKED",
        )
    )
    await db_session.commit()

    with pytest.raises(AppError) as exc_info:
        await require_active_entitlement(current_user=test_user, db=db_session)

    exc = exc_info.value
    assert exc.status_code == status.HTTP_403_FORBIDDEN
    assert exc.code == ErrorCodes.SUBSCRIPTION_INACTIVE


@pytest.mark.asyncio
async def test_future_renewal_row_does_not_hide_current_entitlement(
    db_session: AsyncSession, test_user: User
) -> None:
    """Early renewal may create a future row while the current grant is still valid."""
    now = datetime.now(timezone.utc)
    current = _entitlement(
        test_user,
        starts_at=now - timedelta(days=20),
        expires_at=now + timedelta(days=10),
    )
    future = _entitlement(
        test_user,
        starts_at=now + timedelta(days=10),
        expires_at=now + timedelta(days=40),
    )
    db_session.add_all([current, future])
    await db_session.commit()

    actual = await require_active_entitlement(current_user=test_user, db=db_session)

    assert actual.id == current.id


@pytest.mark.asyncio
async def test_another_users_entitlement_never_grants_access(
    db_session: AsyncSession, test_user: User
) -> None:
    now = datetime.now(timezone.utc)
    other = User(
        id=uuid.uuid4(),
        email=f"other-{uuid.uuid4()}@example.com",
        password_hash="not-used-in-this-test",
        created_at=now,
        updated_at=now,
        failed_login_count=0,
        locked_until=None,
        email_verified=True,
        metadata_payload={},
    )
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        _entitlement(
            other,
            starts_at=now - timedelta(days=1),
            expires_at=now + timedelta(days=30),
        )
    )
    await db_session.commit()

    with pytest.raises(AppError) as exc_info:
        await require_active_entitlement(current_user=test_user, db=db_session)

    assert exc_info.value.code == ErrorCodes.SUBSCRIPTION_REQUIRED
