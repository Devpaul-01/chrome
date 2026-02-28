"""
schemas/messages.py — Pydantic schemas for the message queue and history endpoints.

  MessageQueueCreate   — POST /api/messages/queue body
  MessageQueueUpdate   — PUT  /api/messages/queue/{id} body (fields optional)
  MessageQueue         — full queue item response (ORM-mapped)
  MessageHistoryItem   — history record response (ORM-mapped)
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class MessageQueueBase(BaseModel):
    friend_name: str
    friend_profile_url: str
    birthday_date: datetime
    scheduled_send_time: datetime
    message_content: str


class MessageQueueCreate(MessageQueueBase):
    pass


class MessageQueueUpdate(BaseModel):
    message_content: str | None = None
    scheduled_send_time: datetime | None = None


class MessageQueue(MessageQueueBase):
    id: UUID
    user_id: UUID
    status: str
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MessageHistoryItem(BaseModel):
    id: UUID
    user_id: UUID
    friend_name: str
    friend_profile_url: str
    birthday_date: datetime
    message_content: str
    sent_at: datetime
    status: str
    error_message: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
