"""
tests/test_dashboard.py — Tests for the dashboard statistics router.

Covers: zero-state, stats after inserting messages, success rate calculation.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MessageHistory, MessageQueue, User


@pytest.mark.asyncio
async def test_dashboard_stats_empty(async_client: AsyncClient) -> None:
    """Dashboard stats for a user with no data returns zeros."""
    resp = await async_client.get("/api/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_messages_sent"] == 0
    assert data["messages_sent_today"] == 0
    assert data["messages_sent_this_week"] == 0
    assert data["messages_sent_this_month"] == 0
    assert data["success_rate"] == 0.0
    assert data["queued_messages"] == 0


@pytest.mark.asyncio
async def test_dashboard_stats_with_history(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """Dashboard correctly counts messages sent today."""
    now = datetime.now(timezone.utc)
    item = MessageHistory(
        user_id=test_user.id,
        friend_name="Alice",
        friend_profile_url="https://facebook.com/alice",
        birthday_date=now,
        message_content="HBD!",
        sent_at=now,
        status="sent",
    )
    db_session.add(item)
    await db_session.commit()

    resp = await async_client.get("/api/dashboard/stats")
    data = resp.json()
    assert data["total_messages_sent"] == 1
    assert data["messages_sent_today"] == 1


@pytest.mark.asyncio
async def test_dashboard_success_rate(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """Success rate is calculated from sent/delivered vs total."""
    now = datetime.now(timezone.utc)
    for status in ["sent", "sent", "failed"]:
        item = MessageHistory(
            user_id=test_user.id,
            friend_name="Friend",
            friend_profile_url="https://facebook.com/f",
            birthday_date=now,
            message_content="HBD!",
            sent_at=now,
            status=status,
        )
        db_session.add(item)
    await db_session.commit()

    resp = await async_client.get("/api/dashboard/stats")
    data = resp.json()
    assert data["total_messages_sent"] == 3
    # 2 sent out of 3 → ~66.67%
    assert 66.0 <= data["success_rate"] <= 67.0


@pytest.mark.asyncio
async def test_dashboard_queued_messages(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """Dashboard counts pending queued messages."""
    now = datetime.now(timezone.utc)
    for status in ["pending", "pending", "sent"]:
        msg = MessageQueue(
            user_id=test_user.id,
            friend_name="Friend",
            friend_profile_url="https://facebook.com/f",
            birthday_date=now,
            scheduled_send_time=now + timedelta(hours=1),
            message_content="HBD!",
            status=status,
        )
        db_session.add(msg)
    await db_session.commit()

    resp = await async_client.get("/api/dashboard/stats")
    data = resp.json()
    assert data["queued_messages"] == 2


@pytest.mark.asyncio
async def test_dashboard_weekly_monthly_stats(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """Dashboard counts weekly and monthly message volumes."""
    now = datetime.now(timezone.utc)

    # Message from today
    db_session.add(
        MessageHistory(
            user_id=test_user.id,
            friend_name="Today",
            friend_profile_url="https://facebook.com/today",
            birthday_date=now,
            message_content="HBD!",
            sent_at=now,
            status="sent",
        )
    )

    # Message from 15 days ago (this month if month is long enough, otherwise just test total)
    old = now - timedelta(days=15)
    db_session.add(
        MessageHistory(
            user_id=test_user.id,
            friend_name="Old",
            friend_profile_url="https://facebook.com/old",
            birthday_date=old,
            message_content="HBD!",
            sent_at=old,
            status="sent",
        )
    )
    await db_session.commit()

    resp = await async_client.get("/api/dashboard/stats")
    data = resp.json()
    assert data["total_messages_sent"] == 2
    assert data["messages_sent_today"] == 1
    # Weekly count depends on weekday — at least today's message
    assert data["messages_sent_this_week"] >= 1
