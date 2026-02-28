"""
schemas/schedules.py — Pydantic schemas for birthday schedule entries.

  BirthdayScheduleCreate  — POST /schedules body
  BirthdayScheduleUpdate  — PUT  /schedules/{id} body (enabled flag only)
  BirthdaySchedule        — full schedule response (ORM-mapped)

``days_before`` is a positive integer indicating how many days before a
contact's birthday the scheduler should queue the message.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class BirthdayScheduleBase(BaseModel):
    days_before: int
    enabled: bool = True


class BirthdayScheduleCreate(BirthdayScheduleBase):
    pass


class BirthdayScheduleUpdate(BaseModel):
    enabled: bool | None = None


class BirthdaySchedule(BirthdayScheduleBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
