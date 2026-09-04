"""PostgreSQL-only concurrency integration tests for payment -> entitlement grants.

These tests intentionally bypass the normal in-memory SQLite pytest fixtures.
They require CONCURRENCY_DATABASE_URL to point at a disposable PostgreSQL test
database whose schema has already been upgraded to Alembic head.

Safety:
    The database name MUST contain "test". The suite refuses to run otherwise.

What this suite proves with real PostgreSQL row locking:
    1. Two distinct settled payments for the same user serialize and stack.
    2. Concurrent processing of the same settled payment yields one entitlement.
    3. Different users remain isolated under concurrent settlement.
    4. A failed outer transaction rolls back the entitlement grant.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import urlparse

import pytest
from sqlalchemy import delete, select
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.models import AccessEntitlement, PaymentTransaction, User
from app.services.entitlements import grant_entitlement_for_settled_payment


DB_URL = os.environ.get("CONCURRENCY_DATABASE_URL", "").strip()

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        not DB_URL,
        reason="Set CONCURRENCY_DATABASE_URL to an isolated PostgreSQL test database.",
    ),
]


def _assert_safe_test_database(url: str) -> None:
    parsed = urlparse(url.replace("postgresql+asyncpg://", "postgresql://", 1))
    db_name = (parsed.path or "").lstrip("/").lower()
    if "test" not in db_name:
        raise RuntimeError(
            "Refusing concurrency tests: database name must contain 'test'. "
            f"Received database={db_name!r}."
        )


if DB_URL:
    _assert_safe_test_database(DB_URL)


engine = (
    create_async_engine(
        DB_URL,
        poolclass=NullPool,
    )
    if DB_URL
    else None
)

SessionLocal = (
    async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    if engine is not None
    else None
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _create_user(*, email_prefix: str) -> uuid.UUID:
    assert SessionLocal is not None
    user_id = uuid.uuid4()
    now = _now()
    async with SessionLocal() as session:
        session.add(
            User(
                id=user_id,
                email=f"{email_prefix}-{user_id.hex}@example.test",
                password_hash="concurrency-test-not-a-real-password-hash",
                created_at=now,
                updated_at=now,
                failed_login_count=0,
                locked_until=None,
                email_verified=True,
                metadata_payload={"test": "postgres-concurrency"},
            )
        )
        await session.commit()
    return user_id


async def _create_settled_payment(
    user_id: uuid.UUID,
    *,
    invoice_id: str | None = None,
    plan_code: str = "personal-monthly",
    months: int = 1,
) -> uuid.UUID:
    assert SessionLocal is not None
    payment_id = uuid.uuid4()
    now = _now()
    async with SessionLocal() as session:
        session.add(
            PaymentTransaction(
                id=payment_id,
                user_id=user_id,
                provider="btcpay",
                provider_payment_id=invoice_id or f"pg-race-{uuid.uuid4().hex}",
                provider_order_id=f"order-{uuid.uuid4().hex}",
                amount=Decimal("10.00"),
                currency="USD",
                status="Settled",
                checkout_url="https://example.test/checkout",
                payment_method="bitcoin",
                plan_code=plan_code,
                paid_at=now,
                expires_at=None,
                created_at=now,
                updated_at=now,
                metadata_payload={
                    "billing_term_months": months,
                    "test": "postgres-concurrency",
                },
            )
        )
        await session.commit()
    return payment_id


async def _grant_and_commit(payment_id: uuid.UUID) -> uuid.UUID:
    """Load and grant in a completely independent DB transaction/session."""
    assert SessionLocal is not None
    async with SessionLocal() as session:
        transaction = await session.get(PaymentTransaction, payment_id)
        assert transaction is not None
        entitlement = await grant_entitlement_for_settled_payment(
            db=session,
            transaction=transaction,
        )
        await session.commit()
        return entitlement.id


async def _cleanup() -> None:
    assert SessionLocal is not None
    async with SessionLocal() as session:
        # Only delete rows explicitly marked by this suite.
        test_users = (
            await session.execute(
                select(User.id).where(
                    User.metadata_payload["test"].as_string() == "postgres-concurrency"
                )
            )
        ).scalars().all()

        if test_users:
            # Cascades remove payment transactions and entitlements.
            await session.execute(delete(User).where(User.id.in_(test_users)))
            await session.commit()


@pytest.fixture(autouse=True)
async def clean_test_rows():
    await _cleanup()
    yield
    await _cleanup()


async def test_two_simultaneous_distinct_payments_same_user_stack_without_overlap():
    """The User FOR UPDATE lock must serialize renewal-boundary calculation."""
    assert SessionLocal is not None
    user_id = await _create_user(email_prefix="same-user-stack")
    payment_a = await _create_settled_payment(user_id)
    payment_b = await _create_settled_payment(user_id)

    await asyncio.wait_for(
        asyncio.gather(
            _grant_and_commit(payment_a),
            _grant_and_commit(payment_b),
        ),
        timeout=15,
    )

    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(AccessEntitlement)
                .where(
                    AccessEntitlement.user_id == user_id,
                    AccessEntitlement.plan_code == "personal-monthly",
                )
                .order_by(AccessEntitlement.starts_at.asc())
            )
        ).scalars().all()

    assert len(rows) == 2
    assert rows[0].expires_at == rows[1].starts_at
    assert rows[0].starts_at < rows[0].expires_at
    assert rows[1].starts_at < rows[1].expires_at
    assert {row.source_transaction_id for row in rows} == {payment_a, payment_b}


async def test_same_payment_processed_concurrently_creates_exactly_one_entitlement():
    """Duplicate processing of one payment must converge on one grant."""
    assert SessionLocal is not None
    user_id = await _create_user(email_prefix="same-payment")
    payment_id = await _create_settled_payment(user_id)

    ids = await asyncio.wait_for(
        asyncio.gather(
            _grant_and_commit(payment_id),
            _grant_and_commit(payment_id),
        ),
        timeout=15,
    )

    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(AccessEntitlement).where(
                    AccessEntitlement.source_transaction_id == payment_id
                )
            )
        ).scalars().all()

    assert len(rows) == 1
    assert ids[0] == ids[1] == rows[0].id


async def test_different_users_settle_concurrently_without_cross_user_leakage():
    """Independent users may execute concurrently and must never share grants."""
    assert SessionLocal is not None
    user_a = await _create_user(email_prefix="parallel-a")
    user_b = await _create_user(email_prefix="parallel-b")
    payment_a = await _create_settled_payment(user_a)
    payment_b = await _create_settled_payment(user_b)

    await asyncio.wait_for(
        asyncio.gather(
            _grant_and_commit(payment_a),
            _grant_and_commit(payment_b),
        ),
        timeout=15,
    )

    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(AccessEntitlement).where(
                    AccessEntitlement.user_id.in_([user_a, user_b])
                )
            )
        ).scalars().all()

    assert len(rows) == 2
    by_user = {row.user_id: row for row in rows}
    assert set(by_user) == {user_a, user_b}
    assert by_user[user_a].source_transaction_id == payment_a
    assert by_user[user_b].source_transaction_id == payment_b
    assert by_user[user_a].source_payment_id != by_user[user_b].source_payment_id


async def test_outer_transaction_rollback_leaves_no_entitlement():
    """grant_entitlement flushes only; caller rollback must remove the grant."""
    assert SessionLocal is not None
    user_id = await _create_user(email_prefix="rollback")
    payment_id = await _create_settled_payment(user_id)

    async with SessionLocal() as session:
        transaction = await session.get(PaymentTransaction, payment_id)
        assert transaction is not None
        entitlement = await grant_entitlement_for_settled_payment(
            db=session,
            transaction=transaction,
        )
        entitlement_id = entitlement.id
        await session.rollback()

    async with SessionLocal() as session:
        stored = await session.get(AccessEntitlement, entitlement_id)
        count = (
            await session.execute(
                select(AccessEntitlement).where(
                    AccessEntitlement.source_transaction_id == payment_id
                )
            )
        ).scalars().all()

    assert stored is None
    assert count == []


@pytest.mark.asyncio
async def test_100_different_users_can_receive_entitlements_concurrently():
    """Controlled load smoke test: 100 independent users/payments in parallel.

    This is not a full performance benchmark. It proves correctness and absence
    of cross-user leakage when many independent grants are in flight together.
    """
    assert SessionLocal is not None

    users = await asyncio.gather(
        *[_create_user(email_prefix=f"bulk-{i}") for i in range(100)]
    )
    payments = await asyncio.gather(
        *[_create_settled_payment(user_id) for user_id in users]
    )

    await asyncio.wait_for(
        asyncio.gather(*[_grant_and_commit(payment_id) for payment_id in payments]),
        timeout=45,
    )

    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(AccessEntitlement).where(
                    AccessEntitlement.user_id.in_(users)
                )
            )
        ).scalars().all()

    assert len(rows) == 100
    assert len({row.user_id for row in rows}) == 100
    assert len({row.source_transaction_id for row in rows}) == 100
    assert len({row.source_payment_id for row in rows}) == 100
