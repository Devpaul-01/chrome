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
