from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_messages_sent: int
    messages_sent_today: int
    messages_sent_this_week: int
    messages_sent_this_month: int
    success_rate: float
    friends_with_upcoming_birthdays: int
    queued_messages: int
