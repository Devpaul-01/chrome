"""Tests for API liveness, readiness, and background-worker health."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.models import WorkerHeartbeat
from app.db.session import get_db
from app.main import app


@pytest.fixture
def health_client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_livez_does_not_require_database(health_client):
    async with health_client as client:
        response = await client.get("/livez")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_readyz_reports_database_and_schema_ready(health_client):
    async with health_client as client:
        response = await client.get("/readyz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "ok",
        "schema": "ok",
    }


@pytest.mark.asyncio
async def test_health_preserves_existing_contract(health_client):
    async with health_client as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


@pytest.mark.asyncio
async def test_workers_missing_is_degraded(health_client):
    async with health_client as client:
        response = await client.get("/health/workers")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["workers"]["notification-worker"]["status"] == "missing"
    assert body["workers"]["payment-recovery-worker"]["status"] == "missing"


@pytest.mark.asyncio
async def test_workers_fresh_and_successful_are_healthy(health_client, db_session):
    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            WorkerHeartbeat(
                worker_name="notification-worker",
                started_at=now,
                last_heartbeat_at=now,
                last_success_at=now,
                consecutive_failures=0,
                last_batch_summary={"processed": 3},
                updated_at=now,
            ),
            WorkerHeartbeat(
                worker_name="payment-recovery-worker",
                started_at=now,
                last_heartbeat_at=now,
                last_success_at=now,
                consecutive_failures=0,
                last_batch_summary={"recovered": 1},
                updated_at=now,
            ),
        ]
    )
    await db_session.commit()

    async with health_client as client:
        response = await client.get("/health/workers")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["workers"]["notification-worker"]["status"] == "healthy"
    assert body["workers"]["payment-recovery-worker"]["status"] == "healthy"


@pytest.mark.asyncio
async def test_fresh_worker_with_failures_is_failing(health_client, db_session):
    now = datetime.now(timezone.utc)
    db_session.add(
        WorkerHeartbeat(
            worker_name="notification-worker",
            started_at=now,
            last_heartbeat_at=now,
            last_failure_at=now,
            consecutive_failures=2,
            last_batch_summary={},
            updated_at=now,
        )
    )
    await db_session.commit()

    async with health_client as client:
        response = await client.get("/health/workers")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["workers"]["notification-worker"]["status"] == "failing"
    assert body["workers"]["notification-worker"]["consecutive_failures"] == 2


@pytest.mark.asyncio
async def test_old_heartbeat_is_stale_even_without_failures(health_client, db_session):
    old = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.add(
        WorkerHeartbeat(
            worker_name="payment-recovery-worker",
            started_at=old,
            last_heartbeat_at=old,
            last_success_at=old,
            consecutive_failures=0,
            last_batch_summary={"recovered": 2},
            updated_at=old,
        )
    )
    await db_session.commit()

    async with health_client as client:
        response = await client.get("/health/workers")

    assert response.status_code == 200
    body = response.json()
    worker = body["workers"]["payment-recovery-worker"]
    assert body["status"] == "degraded"
    assert worker["status"] == "stale"
    assert worker["heartbeat_age_seconds"] >= 3500


@pytest.mark.asyncio
async def test_worker_health_exposes_only_stored_sanitized_summary(
    health_client, db_session
):
    now = datetime.now(timezone.utc)
    db_session.add(
        WorkerHeartbeat(
            worker_name="notification-worker",
            started_at=now,
            last_heartbeat_at=now,
            last_success_at=now,
            consecutive_failures=0,
            last_batch_summary={"processed": 8, "sent": 7},
            updated_at=now,
        )
    )
    await db_session.commit()

    async with health_client as client:
        response = await client.get("/health/workers")

    summary = response.json()["workers"]["notification-worker"]["last_batch_summary"]
    assert summary == {"processed": 8, "sent": 7}