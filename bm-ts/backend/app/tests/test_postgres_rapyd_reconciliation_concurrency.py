"""PostgreSQL-only concurrency tests for durable Rapyd reconciliation jobs."""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlparse

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.db.models import (
    PaymentCheckoutAttempt,
    PaymentReconciliationJob,
    PaymentTransaction,
    User,
)
import app.services.rapyd_reconciliation as reconciliation


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
            "Refusing Rapyd concurrency tests: database name must contain "
            f"'test'. Received database={db_name!r}."
        )


if DB_URL:
    _assert_safe_test_database(DB_URL)

engine = create_async_engine(DB_URL, poolclass=NullPool) if DB_URL else None
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


async def _create_case(tag: str, *, status: str = "PENDING", lease=None):
    assert SessionLocal is not None
    now = _now()
    user_id = uuid.uuid4()
    attempt_id = uuid.uuid4()
    tx_id = uuid.uuid4()
    job_id = uuid.uuid4()

    async with SessionLocal() as db:
        user = User(
            id=user_id,
            email=f"rapyd-concurrency-{tag}-{user_id.hex}@example.test",
            password_hash="rapyd-concurrency-test",
            created_at=now,
            updated_at=now,
            failed_login_count=0,
            locked_until=None,
            email_verified=True,
            metadata_payload={"test": "rapyd-reconciliation-concurrency"},
        )
        attempt = PaymentCheckoutAttempt(
            id=attempt_id,
            user_id=user_id,
            provider="rapyd",
            idempotency_key=f"rapyd-concurrency:{attempt_id}",
            plan_code="monthly",
            amount=Decimal("9.70"),
            currency="USD",
            metadata_payload={"test": "rapyd-reconciliation-concurrency"},
            provider_order_id=f"BM-RAPYD-{attempt_id}",
            provider_payment_id=f"checkout_{attempt_id.hex}",
            status="completed",
            created_at=now,
            updated_at=now,
        )
        tx = PaymentTransaction(
            id=tx_id,
            user_id=user_id,
            checkout_attempt_id=attempt_id,
            provider="rapyd",
            provider_payment_id=None,
            provider_order_id=attempt.provider_order_id,
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
            metadata_payload={
                "billing_term_months": 1,
                "test": "rapyd-reconciliation-concurrency",
            },
        )
        job = PaymentReconciliationJob(
            id=job_id,
            transaction_id=tx_id,
            provider="rapyd",
            status=status,
            attempts=0,
            max_attempts=8,
            next_attempt_at=now - timedelta(seconds=1),
            last_attempt_at=None,
            claim_expires_at=lease,
            completed_at=None,
            dead_lettered_at=None,
            last_error_code=None,
            requeue_count=0,
            last_requeued_at=None,
            metadata_payload={"test": "rapyd-reconciliation-concurrency"},
            created_at=now,
            updated_at=now,
        )
        db.add(user)
        await db.flush()
        db.add_all([attempt, tx, job])
        await db.commit()
    return tx_id, job_id


async def _cleanup():
    assert SessionLocal is not None
    async with SessionLocal() as db:
        ids = (
            await db.execute(
                select(User.id).where(
                    User.metadata_payload["test"].as_string()
                    == "rapyd-reconciliation-concurrency"
                )
            )
        ).scalars().all()
        if ids:
            await db.execute(delete(User).where(User.id.in_(ids)))
            await db.commit()


@pytest.fixture(autouse=True)
async def clean_rows():
    await _cleanup()
    yield
    await _cleanup()


async def _run_worker(limit=50, *, now=None, lease_seconds=300):
    assert SessionLocal is not None
    async with SessionLocal() as db:
        return await reconciliation.process_reconciliation_jobs(
            db=db,
            limit=limit,
            now=now,
            lease_seconds=lease_seconds,
        )


async def test_two_workers_claim_one_job_exactly_once(monkeypatch):
    tx_id, job_id = await _create_case("single")
    calls = []
    entered = asyncio.Event()
    release = asyncio.Event()

    async def fake_reconcile(*, db, transaction_id):
        calls.append(transaction_id)
        entered.set()
        await asyncio.wait_for(release.wait(), timeout=5)
        return {"reconciled": True, "reason": "settled"}

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake_reconcile)

    worker_a = asyncio.create_task(_run_worker(limit=1))
    await asyncio.wait_for(entered.wait(), timeout=5)
    worker_b = asyncio.create_task(_run_worker(limit=1))
    await asyncio.sleep(0.15)
    release.set()
    a, b = await asyncio.wait_for(asyncio.gather(worker_a, worker_b), timeout=10)

    assert a["claimed"] + b["claimed"] == 1
    assert a["settled"] + b["settled"] == 1
    assert calls == [tx_id]

    async with SessionLocal() as db:
        job = await db.get(PaymentReconciliationJob, job_id)
        assert job.status == "COMPLETED"
        assert job.attempts == 1
        assert job.claim_expires_at is None


async def test_many_workers_do_not_duplicate_jobs(monkeypatch):
    cases = [await _create_case(f"many-{i}") for i in range(20)]
    tx_ids = {tx for tx, _job in cases}
    calls = []
    lock = asyncio.Lock()

    async def fake_reconcile(*, db, transaction_id):
        async with lock:
            calls.append(transaction_id)
        await asyncio.sleep(0.02)
        return {"reconciled": True, "reason": "settled"}

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake_reconcile)

    results = await asyncio.wait_for(
        asyncio.gather(*[_run_worker(limit=4) for _ in range(8)]),
        timeout=20,
    )

    assert sum(r["claimed"] for r in results) == 20
    assert sum(r["settled"] for r in results) == 20
    assert len(calls) == 20
    assert set(calls) == tx_ids
    assert len(set(calls)) == 20


async def test_live_processing_lease_blocks_second_worker(monkeypatch):
    now = _now()
    tx_id, _ = await _create_case(
        "live-lease",
        status="PROCESSING",
        lease=now + timedelta(minutes=5),
    )
    calls = []

    async def fake_reconcile(*, db, transaction_id):
        calls.append(transaction_id)
        return {"reconciled": True, "reason": "settled"}

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake_reconcile)
    result = await _run_worker(limit=1, now=now)

    assert result["claimed"] == 0
    assert calls == []
    assert tx_id not in calls


async def test_expired_processing_lease_recovers_exactly_once(monkeypatch):
    now = _now()
    tx_id, job_id = await _create_case(
        "expired-lease",
        status="PROCESSING",
        lease=now - timedelta(seconds=1),
    )
    calls = []

    async def fake_reconcile(*, db, transaction_id):
        calls.append(transaction_id)
        await asyncio.sleep(0.05)
        return {"reconciled": True, "reason": "settled"}

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake_reconcile)

    results = await asyncio.wait_for(
        asyncio.gather(*[_run_worker(limit=1, now=now) for _ in range(4)]),
        timeout=15,
    )

    assert sum(r["claimed"] for r in results) == 1
    assert sum(r["settled"] for r in results) == 1
    assert calls == [tx_id]

    async with SessionLocal() as db:
        job = await db.get(PaymentReconciliationJob, job_id)
        assert job.status == "COMPLETED"
        assert job.attempts == 1
        assert job.claim_expires_at is None


async def test_claim_is_durable_before_provider_io(monkeypatch):
    tx_id, job_id = await _create_case("durable-claim")
    observed = {}

    async def fake_reconcile(*, db, transaction_id):
        assert SessionLocal is not None
        async with SessionLocal() as observer:
            job = await observer.get(PaymentReconciliationJob, job_id)
            observed["status"] = job.status
            observed["attempts"] = job.attempts
            observed["lease"] = job.claim_expires_at
        raise reconciliation.rapyd.RapydTransportError("network")

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake_reconcile)
    result = await _run_worker(limit=1)

    assert result["claimed"] == 1
    assert result["retry"] == 1
    assert observed["status"] == "PROCESSING"
    assert observed["attempts"] == 1
    assert observed["lease"] is not None

    async with SessionLocal() as db:
        job = await db.get(PaymentReconciliationJob, job_id)
        assert job.status == "RETRY"
        assert job.attempts == 1
        assert job.claim_expires_at is None
        assert job.last_error_code == "rapyd_transport_error"
