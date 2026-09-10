"""Database-backed operational heartbeats for background workers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import WorkerHeartbeat


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_summary(summary: dict[str, Any] | None) -> dict[str, Any]:
    """Keep heartbeat metadata bounded to non-sensitive scalar counters."""
    if not summary:
        return {}

    safe: dict[str, Any] = {}
    for key, value in summary.items():
        if (
            isinstance(key, str)
            and len(key) <= 64
            and isinstance(value, (int, float, bool))
            and not isinstance(value, str)
        ):
            safe[key] = value
    return safe


async def record_worker_started(db: AsyncSession, worker_name: str) -> None:
    now = _now()
    stmt = insert(WorkerHeartbeat).values(
        worker_name=worker_name,
        started_at=now,
        last_heartbeat_at=now,
        consecutive_failures=0,
        last_batch_summary={},
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[WorkerHeartbeat.worker_name],
        set_={
            "started_at": now,
            "last_heartbeat_at": now,
            "consecutive_failures": 0,
            "last_batch_summary": {},
            "updated_at": now,
        },
    )
    await db.execute(stmt)
    await db.commit()


async def record_worker_success(
    db: AsyncSession,
    worker_name: str,
    summary: dict[str, Any] | None = None,
) -> None:
    now = _now()
    safe_summary = _safe_summary(summary)
    stmt = insert(WorkerHeartbeat).values(
        worker_name=worker_name,
        started_at=now,
        last_heartbeat_at=now,
        last_success_at=now,
        consecutive_failures=0,
        last_batch_summary=safe_summary,
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[WorkerHeartbeat.worker_name],
        set_={
            "last_heartbeat_at": now,
            "last_success_at": now,
            "consecutive_failures": 0,
            "last_batch_summary": safe_summary,
            "updated_at": now,
        },
    )
    await db.execute(stmt)
    await db.commit()


async def record_worker_failure(db: AsyncSession, worker_name: str) -> None:
    now = _now()
    stmt = insert(WorkerHeartbeat).values(
        worker_name=worker_name,
        started_at=now,
        last_heartbeat_at=now,
        last_failure_at=now,
        consecutive_failures=1,
        last_batch_summary={},
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[WorkerHeartbeat.worker_name],
        set_={
            "last_heartbeat_at": now,
            "last_failure_at": now,
            "consecutive_failures": WorkerHeartbeat.consecutive_failures + 1,
            "last_batch_summary": {},
            "updated_at": now,
        },
    )
    await db.execute(stmt)
    await db.commit()