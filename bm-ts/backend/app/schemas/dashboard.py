"""
schemas/dashboard.py — Pydantic response schema for the dashboard stats endpoint.

All fields are read-only aggregates computed by the dashboard router from
``message_history`` and ``message_queue`` at request time.
"""

from pydantic import BaseModel


class DashboardStats(BaseModel):
    """Aggregate statistics returned by GET /api/dashboard/stats."""

    total_messages_sent: int
    messages_sent_today: int
    messages_sent_this_week: int
    messages_sent_this_month: int
    success_rate: float
    friends_with_upcoming_birthdays: int
    queued_messages: int
