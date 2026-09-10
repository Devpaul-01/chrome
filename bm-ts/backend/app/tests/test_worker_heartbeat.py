"""Regression tests for database-backed worker heartbeat state."""

import pytest
from sqlalchemy import select

from app.db.models import WorkerHeartbeat
from app.services.worker_heartbeat import (
    record_worker_failure,
    record_worker_started,
    record_worker_success,
)


@pytest.mark.asyncio
async def test_worker_start_creates_heartbeat(db_session):
    await record_worker_started(db_session, "test-worker")

    row = await db_session.get(WorkerHeartbeat, "test-worker")
    assert row is not None
    assert row.worker_name == "test-worker"
    assert row.started_at is not None
    assert row.last_heartbeat_at is not None
    assert row.consecutive_failures == 0
    assert row.last_batch_summary == {}


@pytest.mark.asyncio
async def test_worker_success_updates_state_and_safe_summary(db_session):
    await record_worker_started(db_session, "success-worker")
    await record_worker_success(
        db_session,
        "success-worker",
        {
            "processed": 5,
            "sent": 4,
            "failed": 1,
            "provider_response": "secret-value",
            "customer_email": "person@example.com",
        },
    )

    row = await db_session.get(WorkerHeartbeat, "success-worker")
    await db_session.refresh(row)

    assert row.last_success_at is not None
    assert row.last_heartbeat_at is not None
    assert row.consecutive_failures == 0
    assert row.last_batch_summary == {
        "processed": 5,
        "sent": 4,
        "failed": 1,
    }
    assert "provider_response" not in row.last_batch_summary
    assert "customer_email" not in row.last_batch_summary


@pytest.mark.asyncio
async def test_worker_failure_increments_consecutive_failures(db_session):
    await record_worker_started(db_session, "failure-worker")

    await record_worker_failure(db_session, "failure-worker")
    await record_worker_failure(db_session, "failure-worker")

    row = await db_session.get(WorkerHeartbeat, "failure-worker")
    await db_session.refresh(row)

    assert row.last_failure_at is not None
    assert row.last_heartbeat_at is not None
    assert row.consecutive_failures == 2
    assert row.last_batch_summary == {}


@pytest.mark.asyncio
async def test_success_after_failures_resets_counter(db_session):
    await record_worker_started(db_session, "recovery-worker")
    await record_worker_failure(db_session, "recovery-worker")
    await record_worker_failure(db_session, "recovery-worker")

    await record_worker_success(
        db_session,
        "recovery-worker",
        {"processed": 3, "recovered": 2},
    )

    row = await db_session.get(WorkerHeartbeat, "recovery-worker")
    await db_session.refresh(row)

    assert row.consecutive_failures == 0
    assert row.last_success_at is not None
    assert row.last_batch_summary == {"processed": 3, "recovered": 2}


@pytest.mark.asyncio
async def test_summary_rejects_strings_and_oversized_keys(db_session):
    await record_worker_success(
        db_session,
        "filter-worker",
        {
            "count": 7,
            "healthy": True,
            "ratio": 0.5,
            "message": "must-not-be-stored",
            "x" * 65: 99,
        },
    )

    result = await db_session.execute(
        select(WorkerHeartbeat).where(
            WorkerHeartbeat.worker_name == "filter-worker"
        )
    )
    row = result.scalar_one()

    assert row.last_batch_summary == {
        "count": 7,
        "healthy": True,
        "ratio": 0.5,
    }