"""
schemas/birthday_config.py — Pydantic schemas for birthday automation configuration.

  BirthdayModeEnum      — EARLY / ON_DAY / BELATED message timing modes (matches DB ENUM)
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

from pydantic import BaseModel, ConfigDict, Field, field_validator, ValidationInfo

from app.schemas.enums import GenderEnum


class BirthdayModeEnum(str, Enum):
    EARLY = "EARLY"
    ON_DAY = "ON_DAY"
    BELATED = "BELATED"


class BirthdayConfigCreate(BaseModel):
    mode: BirthdayModeEnum
    days_offset: int = Field(..., ge=-7, le=7)
    message_group_id: Optional[UUID] = None
    post_id: Optional[UUID] = None
    gender_filter: GenderEnum = GenderEnum.ALL
    archive_enabled: bool = False
    enabled: bool = True

    @field_validator("days_offset", mode="before")
    @classmethod
    def validate_days_offset(cls, v: int, info: ValidationInfo) -> int:
        mode = info.data.get("mode")
        if mode == BirthdayModeEnum.EARLY and not (-7 <= v <= -1):
            raise ValueError("For EARLY mode, days_offset must be between -7 and -1")
        elif mode == BirthdayModeEnum.ON_DAY and v != 0:
            raise ValueError("For ON_DAY mode, days_offset must be 0")
        elif mode == BirthdayModeEnum.BELATED and not (1 <= v <= 7):
            raise ValueError("For BELATED mode, days_offset must be between 1 and 7")
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
