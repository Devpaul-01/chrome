"""
routers/rate_limits.py — Server-side message-send rate limiting.

Enforces hourly / daily / weekly caps that cannot be bypassed by clearing
browser storage.  The extension should call ``POST /api/rate-limits/record``
after each successful send and ``GET /api/rate-limits/status`` before each
send attempt.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, status

from app.core.errors import AppError, ErrorCodes
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import SendRateLimit, User
from app.db.session import get_db
from app.schemas.common import ErrorResponse

router = APIRouter(prefix="/rate-limits", tags=["rate-limits"], responses={
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    429: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
})

# ── Caps (must match extension-side constants) ──────────────────────────────
HOURLY_CAP = 1
DAILY_CAP = 3
WEEKLY_CAP = 5


class BucketInfo(BaseModel):
    used: int
    cap: int


class RateLimitStatusResponse(BaseModel):
    allowed: bool
    reason: str | None = None
    hourly: BucketInfo
    daily: BucketInfo
    weekly: BucketInfo


def _prune(timestamps: List[str]) -> List[str]:
    """Drop entries older than 7 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    return [
        ts
        for ts in timestamps
        if datetime.fromisoformat(ts.replace("Z", "+00:00")) > cutoff
    ]


def _count_window(timestamps: List[str], window: timedelta) -> int:
    cutoff = datetime.now(timezone.utc) - window
    return sum(
        1
        for ts in timestamps
        if datetime.fromisoformat(ts.replace("Z", "+00:00")) > cutoff
    )


async def _get_or_create(user_id, db: AsyncSession) -> SendRateLimit:
    stmt = select(SendRateLimit).where(SendRateLimit.user_id == user_id)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if record is None:
        record = SendRateLimit(user_id=user_id, timestamps=[])
        db.add(record)
        await db.flush()
    return record


@router.get("/status", response_model=RateLimitStatusResponse)
async def rate_limit_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RateLimitStatusResponse:
    """Return current rate-limit counters for the authenticated user."""
    record = await _get_or_create(current_user.id, db)
    ts = _prune(record.timestamps)

    hourly = _count_window(ts, timedelta(hours=1))
    daily = _count_window(ts, timedelta(days=1))
    weekly = len(ts)

    resp = RateLimitStatusResponse(
        allowed=True,
        hourly=BucketInfo(used=hourly, cap=HOURLY_CAP),
        daily=BucketInfo(used=daily, cap=DAILY_CAP),
        weekly=BucketInfo(used=weekly, cap=WEEKLY_CAP),
    )

    if hourly >= HOURLY_CAP:
        resp.allowed = False
        resp.reason = f"Hourly limit reached ({HOURLY_CAP} messages/hour)."
    elif daily >= DAILY_CAP:
        resp.allowed = False
        resp.reason = f"Daily limit reached ({DAILY_CAP} messages/day)."
    elif weekly >= WEEKLY_CAP:
        resp.allowed = False
        resp.reason = f"Weekly limit reached ({WEEKLY_CAP} messages/week)."

    return resp


@router.post("/record", response_model=RateLimitStatusResponse)
async def record_send(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RateLimitStatusResponse:
    """Record a successful message send and return updated counters.

    Returns 429 if the send would exceed a cap (the timestamp is NOT recorded).
    """
    record = await _get_or_create(current_user.id, db)
    ts = _prune(record.timestamps)

    hourly = _count_window(ts, timedelta(hours=1))
    daily = _count_window(ts, timedelta(days=1))
    weekly = len(ts)

    # Block if already at cap
    if hourly >= HOURLY_CAP or daily >= DAILY_CAP or weekly >= WEEKLY_CAP:
        reason = "Rate limit exceeded"
        if hourly >= HOURLY_CAP:
            reason = f"Hourly limit reached ({HOURLY_CAP}/hour)."
        elif daily >= DAILY_CAP:
            reason = f"Daily limit reached ({DAILY_CAP}/day)."
        else:
            reason = f"Weekly limit reached ({WEEKLY_CAP}/week)."
        raise AppError(
            status.HTTP_429_TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMIT_EXCEEDED, reason
        )

    # Append the new timestamp
    ts.append(datetime.now(timezone.utc).isoformat())
    record.timestamps = ts
    record.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)

    # Recompute after recording
    hourly = _count_window(ts, timedelta(hours=1))
    daily = _count_window(ts, timedelta(days=1))
    weekly = len(ts)

    return RateLimitStatusResponse(
        allowed=True,
        hourly=BucketInfo(used=hourly, cap=HOURLY_CAP),
        daily=BucketInfo(used=daily, cap=DAILY_CAP),
        weekly=BucketInfo(used=weekly, cap=WEEKLY_CAP),
    )

