from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.db.models import PaymentCheckoutAttempt, PaymentReconciliationJob, PaymentTransaction
from app.services import rapyd
from app.services import rapyd_reconciliation as svc


def _as_utc(value: datetime) -> datetime:
    """Normalize DB-returned datetimes for SQLite/PostgreSQL parity."""
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def _tx(db, user):
    now = datetime.now(timezone.utc)
    aid = uuid4()
    attempt = PaymentCheckoutAttempt(
        id=aid,
        user_id=user.id,
        provider="rapyd",
        idempotency_key=f"rapyd:{aid}",
        plan_code="monthly",
        amount=Decimal("9.70"),
        currency="USD",
        metadata_payload={},
        provider_order_id=f"BM-RAPYD-{aid}",
        provider_payment_id=f"checkout_{uuid4().hex}",
        status="completed",
        created_at=now - timedelta(minutes=10),
        updated_at=now - timedelta(minutes=10),
    )
    tx = PaymentTransaction(
        id=uuid4(),
        user_id=user.id,
        checkout_attempt_id=aid,
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
        metadata_payload={"billing_term_months": 1},
    )
    db.add_all([attempt, tx])
    await db.commit()
    return tx


@pytest.mark.asyncio
async def test_ensure_job_is_unique_per_transaction(db_session, test_user):
    tx = await _tx(db_session, test_user)
    a = await svc.ensure_reconciliation_job(db=db_session, transaction_id=tx.id)
    b = await svc.ensure_reconciliation_job(db=db_session, transaction_id=tx.id)
    await db_session.commit()
    assert a.id == b.id
    count = await db_session.scalar(select(func.count()).select_from(PaymentReconciliationJob))
    assert count == 1


@pytest.mark.asyncio
async def test_success_completes_job(db_session, test_user, monkeypatch):
    tx = await _tx(db_session, test_user)
    job = await svc.ensure_reconciliation_job(db=db_session, transaction_id=tx.id)

    async def ok(**_kwargs):
        return {"reconciled": True, "reason": "settled"}

    monkeypatch.setattr(svc, "reconcile_rapyd_transaction", ok)
    result = await svc.process_reconciliation_jobs(db=db_session)
    await db_session.refresh(job)

    assert result["settled"] == 1
    assert job.status == "COMPLETED"
    assert job.completed_at is not None
    assert job.claim_expires_at is None


@pytest.mark.asyncio
async def test_transport_failure_retries_with_backoff(db_session, test_user, monkeypatch):
    tx = await _tx(db_session, test_user)
    job = await svc.ensure_reconciliation_job(db=db_session, transaction_id=tx.id)
    before = datetime.now(timezone.utc)

    async def fail(**_kwargs):
        raise rapyd.RapydTransportError("network")

    monkeypatch.setattr(svc, "reconcile_rapyd_transaction", fail)
    result = await svc.process_reconciliation_jobs(db=db_session, now=before)
    await db_session.refresh(job)

    assert result["retry"] == 1
    assert job.status == "RETRY"
    assert job.attempts == 1
    assert _as_utc(job.next_attempt_at) >= before + timedelta(seconds=30)
    assert job.dead_lettered_at is None


@pytest.mark.asyncio
async def test_rate_limit_respects_retry_after(db_session, test_user, monkeypatch):
    tx = await _tx(db_session, test_user)
    job = await svc.ensure_reconciliation_job(db=db_session, transaction_id=tx.id)
    now = datetime.now(timezone.utc)

    async def fail(**_kwargs):
        raise rapyd.RapydRateLimitError(retry_after=120)

    monkeypatch.setattr(svc, "reconcile_rapyd_transaction", fail)
    await svc.process_reconciliation_jobs(db=db_session, now=now)
    await db_session.refresh(job)

    assert job.status == "RETRY"
    assert _as_utc(job.next_attempt_at) >= now + timedelta(seconds=120)


@pytest.mark.asyncio
async def test_terminal_provider_error_dead_letters_immediately(db_session, test_user, monkeypatch):
    tx = await _tx(db_session, test_user)
    job = await svc.ensure_reconciliation_job(db=db_session, transaction_id=tx.id)

    async def fail(**_kwargs):
        raise rapyd.RapydProviderError(status_code=400, provider_code="BAD_REQUEST")

    monkeypatch.setattr(svc, "reconcile_rapyd_transaction", fail)
    result = await svc.process_reconciliation_jobs(db=db_session)
    await db_session.refresh(job)

    assert result["dead_lettered"] == 1
    assert job.status == "FAILED"
    assert job.dead_lettered_at is not None
    assert job.last_error_code == "rapyd_provider_terminal"


@pytest.mark.asyncio
async def test_exhausted_retry_dead_letters(db_session, test_user, monkeypatch):
    tx = await _tx(db_session, test_user)
    job = await svc.ensure_reconciliation_job(
        db=db_session, transaction_id=tx.id, max_attempts=1
    )

    async def fail(**_kwargs):
        raise rapyd.RapydTransportError("network")

    monkeypatch.setattr(svc, "reconcile_rapyd_transaction", fail)
    result = await svc.process_reconciliation_jobs(db=db_session)
    await db_session.refresh(job)

    assert result["dead_lettered"] == 1
    assert job.status == "FAILED"
    assert job.attempts == 1
    assert job.dead_lettered_at is not None


@pytest.mark.asyncio
async def test_processing_job_with_live_lease_is_not_claimed(db_session, test_user):
    tx = await _tx(db_session, test_user)
    job = await svc.ensure_reconciliation_job(db=db_session, transaction_id=tx.id)
    now = datetime.now(timezone.utc)
    job.status = "PROCESSING"
    job.claim_expires_at = now + timedelta(minutes=5)
    job.next_attempt_at = now - timedelta(minutes=1)
    await db_session.commit()

    result = await svc.process_reconciliation_jobs(db=db_session, now=now)
    assert result["claimed"] == 0
