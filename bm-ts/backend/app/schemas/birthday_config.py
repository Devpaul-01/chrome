"""
schemas/birthday_config.py — Pydantic schemas for birthday automation configuration.

  BirthdayModeEnum      — advance / normal / followup message timing modes
  BirthdayConfigCreate  — POST /api/birthday-configs body (includes mode-aware offset validator)
  BirthdayConfigUpdate  — PUT  /api/birthday-configs/{id} body (all fields optional)
  BirthdayConfigToggle  — PATCH /api/birthday-configs/{id}/toggle body (enable/disable only)
  BirthdayConfigOut     — full config response (ORM-mapped)
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, validator


class BirthdayModeEnum(str, Enum):
    ADVANCE = "advance"
    NORMAL = "normal"
    FOLLOWUP = "followup"


class GenderEnum(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    NEUTRAL = "NEUTRAL"
    ALL = "ALL"


class BirthdayConfigCreate(BaseModel):
    mode: BirthdayModeEnum
    days_offset: int = Field(..., ge=-7, le=7)
    message_group_id: Optional[UUID] = None
    post_id: Optional[UUID] = None
    gender_filter: GenderEnum = GenderEnum.ALL
    archive_enabled: bool = False
    enabled: bool = True

    @validator("days_offset")
    def validate_days_offset(cls, v, values):
        mode = values.get("mode")
        if mode == BirthdayModeEnum.ADVANCE and not (-7 <= v <= -1):
            raise ValueError("For advance mode, days_offset must be between -7 and -1")
        elif mode == BirthdayModeEnum.NORMAL and v != 0:
            raise ValueError("For normal mode, days_offset must be 0")
        elif mode == BirthdayModeEnum.FOLLOWUP and not (1 <= v <= 7):
            raise ValueError("For followup mode, days_offset must be between 1 and 7")
        return v


class BirthdayConfigUpdate(BaseModel):
    days_offset: Optional[int] = Field(None, ge=-7, le=7)
    message_group_id: Optional[UUID] = None
    post_id: Optional[UUID] = None
    gender_filter: Optional[GenderEnum] = None
    archive_enabled: Optional[bool] = None
    enabled: Optional[bool] = None


class BirthdayConfigToggle(BaseModel):
    enabled: bool


class BirthdayConfigOut(BaseModel):
    id: UUID
    mode: BirthdayModeEnum
    days_offset: int
    message_group_id: Optional[UUID]
    post_id: Optional[UUID]
    gender_filter: GenderEnum
    archive_enabled: bool
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
