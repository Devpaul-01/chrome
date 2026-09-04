"""PostgreSQL-only concurrency tests for the notification outbox worker.

Requires CONCURRENCY_DATABASE_URL to point to a disposable PostgreSQL database
whose name contains "test".  Uses NullPool so each concurrent worker owns an
independent physical connection and event-loop lifecycle.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.db.models import NotificationOutbox, User
import app.services.notifications as notification_service


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
            "Refusing notification concurrency tests: database name must contain "
            f"'test'. Received database={db_name!r}."
        )


if DB_URL:
    _assert_safe_test_database(DB_URL)

engine = (
    create_async_engine(DB_URL, poolclass=NullPool)
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


async def _create_user(tag: str) -> uuid.UUID:
    assert SessionLocal is not None
    user_id = uuid.uuid4()
    now = _now()
    async with SessionLocal() as db:
        db.add(
            User(
                id=user_id,
                email=f"notification-{tag}-{user_id.hex}@example.test",
                password_hash="notification-concurrency-test",
                created_at=now,
                updated_at=now,
                failed_login_count=0,
                locked_until=None,
                email_verified=True,
                metadata_payload={"test": "notification-worker-concurrency"},
            )
        )
        await db.commit()
    return user_id


async def _create_due_notification(
    user_id: uuid.UUID,
    *,
    key: str | None = None,
    status: str = "PENDING",
    updated_at: datetime | None = None,
) -> uuid.UUID:
    assert SessionLocal is not None
    now = _now()
    row_id = uuid.uuid4()
    async with SessionLocal() as db:
        db.add(
            NotificationOutbox(
                id=row_id,
                user_id=user_id,
                entitlement_id=None,
                source_transaction_id=None,
                notification_type="subscription_activated",
                channel="email",
                recipient=f"{user_id.hex}@example.test",
                subject="Concurrency test",
                body_text="test",
                body_html="<p>test</p>",
                idempotency_key=key or f"notification-concurrency:{uuid.uuid4().hex}",
                status=status,
                attempts=0,
                max_attempts=5,
                scheduled_for=now - timedelta(seconds=1),
                next_attempt_at=now - timedelta(seconds=1),
                metadata_payload={"test": "notification-worker-concurrency"},
                created_at=now,
                updated_at=updated_at or now,
            )
        )
        await db.commit()
    return row_id


async def _cleanup() -> None:
    assert SessionLocal is not None
    async with SessionLocal() as db:
        ids = (
            await db.execute(
                select(User.id).where(
                    User.metadata_payload["test"].as_string()
                    == "notification-worker-concurrency"
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


async def _run_worker(limit: int = 50):
    assert SessionLocal is not None
    async with SessionLocal() as db:
        return await notification_service.process_notification_batch(
            db=db,
            limit=limit,
        )


async def test_two_workers_claim_one_row_exactly_once(monkeypatch):
    user_id = await _create_user("single")
    row_id = await _create_due_notification(user_id)

    calls: list[uuid.UUID] = []
    gate = asyncio.Event()

    async def fake_send(row):
        calls.append(row.id)
        gate.set()
        await asyncio.sleep(0.25)
        return f"provider-{row.id}"

    monkeypatch.setattr(notification_service, "deliver_notification", fake_send)

    worker_a = asyncio.create_task(_run_worker(limit=1))
    await asyncio.wait_for(gate.wait(), timeout=5)
    worker_b = asyncio.create_task(_run_worker(limit=1))
    a, b = await asyncio.wait_for(asyncio.gather(worker_a, worker_b), timeout=10)

    assert a["claimed"] + b["claimed"] == 1
    assert a["sent"] + b["sent"] == 1
    assert calls == [row_id]

    assert SessionLocal is not None
    async with SessionLocal() as db:
        row = await db.get(NotificationOutbox, row_id)
        assert row is not None
        assert row.status == "SENT"
        assert row.attempts == 1


async def test_many_workers_do_not_duplicate_deliveries(monkeypatch):
    user_id = await _create_user("many")
    row_ids = [
        await _create_due_notification(user_id)
        for _ in range(25)
    ]

    calls: list[uuid.UUID] = []
    lock = asyncio.Lock()

    async def fake_send(row):
        async with lock:
            calls.append(row.id)
        await asyncio.sleep(0.02)
        return f"provider-{row.id}"

    monkeypatch.setattr(notification_service, "deliver_notification", fake_send)

    results = await asyncio.wait_for(
        asyncio.gather(*[_run_worker(limit=5) for _ in range(10)]),
        timeout=20,
    )

    assert sum(r["claimed"] for r in results) == 25
    assert sum(r["sent"] for r in results) == 25
    assert len(calls) == 25
    assert set(calls) == set(row_ids)
    assert len(set(calls)) == 25

    assert SessionLocal is not None
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(NotificationOutbox).where(NotificationOutbox.id.in_(row_ids))
            )
        ).scalars().all()

    assert len(rows) == 25
    assert all(r.status == "SENT" for r in rows)
    assert all(r.attempts == 1 for r in rows)


async def test_stale_processing_row_is_recovered_once(monkeypatch):
    user_id = await _create_user("stale")
    stale_time = _now() - timedelta(minutes=30)
    row_id = await _create_due_notification(
        user_id,
        status="PROCESSING",
        updated_at=stale_time,
    )

    calls: list[uuid.UUID] = []

    async def fake_send(row):
        calls.append(row.id)
        return f"provider-{row.id}"

    monkeypatch.setattr(notification_service, "deliver_notification", fake_send)

    results = await asyncio.wait_for(
        asyncio.gather(*[_run_worker(limit=1) for _ in range(4)]),
        timeout=15,
    )

    assert sum(r["recovered"] for r in results) == 1
    assert sum(r["sent"] for r in results) == 1
    assert calls == [row_id]

    assert SessionLocal is not None
    async with SessionLocal() as db:
        row = await db.get(NotificationOutbox, row_id)
        assert row is not None
        assert row.status == "SENT"
        assert row.attempts == 1


async def test_concurrent_same_idempotency_key_converges_to_one_row():
    assert SessionLocal is not None
    user_id = await _create_user("enqueue-race")
    key = f"notification-enqueue-race:{uuid.uuid4().hex}"
    now = _now()

    async def enqueue_once(subject: str):
        async with SessionLocal() as db:
            user = await db.get(User, user_id)
            assert user is not None
            row = await notification_service._enqueue(
                db=db,
                user=user,
                notification_type="subscription_activated",
                subject=subject,
                body_html=f"<p>{subject}</p>",
                idempotency_key=key,
                scheduled_for=now,
            )
            await db.commit()
            return row.id

    ids = await asyncio.wait_for(
        asyncio.gather(
            enqueue_once("A"),
            enqueue_once("B"),
            enqueue_once("C"),
            enqueue_once("D"),
        ),
        timeout=15,
    )

    assert len(set(ids)) == 1

    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(NotificationOutbox).where(
                    NotificationOutbox.idempotency_key == key
                )
            )
        ).scalars().all()

    assert len(rows) == 1
