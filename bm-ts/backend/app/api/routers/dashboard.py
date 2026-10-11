from datetime import datetime, timedelta, timezone
from typing import Any, NamedTuple

from fastapi import APIRouter, Depends
from sqlalchemy import select, and_, func, extract, or_, literal
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_active_entitlement
from app.db.models import User, MessageHistory, MessageQueue, Contact
from app.db.session import get_db
from app.schemas.dashboard import DashboardStats
from app.schemas.common import ErrorResponse

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
}

router = APIRouter(prefix="/dashboard", tags=["dashboard"], responses=_ERROR_RESPONSES, dependencies=[Depends(require_active_entitlement)])

# ---------------------------------------------------------------------------
# Per-user TTL cache (30 s) — avoids redundant DB round-trips when the
# dashboard polls frequently.  Keyed by user UUID; each entry stores the
# response model and its creation timestamp.
# ---------------------------------------------------------------------------
_STATS_TTL = timedelta(seconds=30)


class _CacheEntry(NamedTuple):
    stats: DashboardStats
    expires_at: datetime


_stats_cache: dict[str, _CacheEntry] = {}


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard statistics for the current user"""
    user_id = str(current_user.id)
    now = datetime.now(timezone.utc)

    # Return cached stats if still fresh
    cached = _stats_cache.get(user_id)
    if cached is not None and now < cached.expires_at:
        return cached.stats
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    # Total messages sent
    total_result = await db.execute(
        select(func.count(MessageHistory.id)).where(
            MessageHistory.user_id == current_user.id
        )
    )
    total_messages_sent = total_result.scalar() or 0

    # Messages sent today
    today_result = await db.execute(
        select(func.count(MessageHistory.id)).where(
            and_(
                MessageHistory.user_id == current_user.id,
                MessageHistory.sent_at >= today_start,
            )
        )
    )
    messages_sent_today = today_result.scalar() or 0

    # Messages sent this week
    week_result = await db.execute(
        select(func.count(MessageHistory.id)).where(
            and_(
                MessageHistory.user_id == current_user.id,
                MessageHistory.sent_at >= week_start,
            )
        )
    )
    messages_sent_this_week = week_result.scalar() or 0

    # Messages sent this month
    month_result = await db.execute(
        select(func.count(MessageHistory.id)).where(
            and_(
                MessageHistory.user_id == current_user.id,
                MessageHistory.sent_at >= month_start,
            )
        )
    )
    messages_sent_this_month = month_result.scalar() or 0

    # Success rate
    success_result = await db.execute(
        select(func.count(MessageHistory.id)).where(
            and_(
                MessageHistory.user_id == current_user.id,
                MessageHistory.status.in_(["sent", "delivered"]),
            )
        )
    )
    successful_messages = success_result.scalar() or 0
    success_rate = (
        (successful_messages / total_messages_sent * 100)
        if total_messages_sent > 0
        else 0.0
    )

    # Queued messages
    queued_result = await db.execute(
        select(func.count(MessageQueue.id)).where(
            and_(
                MessageQueue.user_id == current_user.id,
                MessageQueue.status == "pending",
            )
        )
    )
    queued_messages = queued_result.scalar() or 0

    # Upcoming birthdays (contacts with birthday month/day within the next 30 days).
    # Birthday year is stored as epoch (2000), so we compare month+day only.
    today_md = now.month * 100 + now.day  # e.g. April 12 → 412
    future = now + timedelta(days=30)
    future_md = future.month * 100 + future.day

    contact_md = extract("month", Contact.birthday) * literal(100) + extract(
        "day", Contact.birthday
    )

    if today_md <= future_md:
        # Normal case: no year wrap (e.g. Apr 12 → May 12)
        upcoming_filter = and_(contact_md >= today_md, contact_md <= future_md)
    else:
        # Year wrap (e.g. Dec 15 → Jan 14)
        upcoming_filter = or_(contact_md >= today_md, contact_md <= future_md)

    upcoming_result = await db.execute(
        select(func.count(Contact.id)).where(
            and_(
                Contact.user_id == current_user.id,
                Contact.birthday_month_only.is_(False),
                upcoming_filter,
            )
        )
    )
    friends_with_upcoming_birthdays = upcoming_result.scalar() or 0

    stats = DashboardStats(
        total_messages_sent=total_messages_sent,
        messages_sent_today=messages_sent_today,
        messages_sent_this_week=messages_sent_this_week,
        messages_sent_this_month=messages_sent_this_month,
        success_rate=round(success_rate, 2),
        friends_with_upcoming_birthdays=friends_with_upcoming_birthdays,
        queued_messages=queued_messages,
    )

    _stats_cache[user_id] = _CacheEntry(stats=stats, expires_at=now + _STATS_TTL)
    return stats
