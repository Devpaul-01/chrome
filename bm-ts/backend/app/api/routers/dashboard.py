from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User, MessageHistory, MessageQueue, Contact
from app.db.session import get_db
from app.schemas.dashboard import DashboardStats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard statistics for the current user"""
    now = datetime.utcnow()
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
    success_rate = (successful_messages / total_messages_sent * 100) if total_messages_sent > 0 else 0.0

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

    # Upcoming birthdays (contacts with birthday within the next 30 days)
    upcoming_result = await db.execute(
        select(func.count(Contact.id)).where(
            and_(
                Contact.user_id == current_user.id,
                Contact.birthday >= today_start,
                Contact.birthday <= today_start + timedelta(days=30),
            )
        )
    )
    friends_with_upcoming_birthdays = upcoming_result.scalar() or 0

    return DashboardStats(
        total_messages_sent=total_messages_sent,
        messages_sent_today=messages_sent_today,
        messages_sent_this_week=messages_sent_this_week,
        messages_sent_this_month=messages_sent_this_month,
        success_rate=round(success_rate, 2),
        friends_with_upcoming_birthdays=friends_with_upcoming_birthdays,
        queued_messages=queued_messages,
    )
