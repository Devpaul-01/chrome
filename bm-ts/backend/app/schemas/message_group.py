from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GenderEnum(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    NEUTRAL = "NEUTRAL"
    ALL = "ALL"


class MessageGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    gender: GenderEnum = GenderEnum.NEUTRAL
    segment_ids: List[UUID] = Field(default_factory=list)


class MessageGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    gender: Optional[GenderEnum] = None
    segment_ids: Optional[List[UUID]] = None


class MessageGroupOut(BaseModel):
    id: UUID
    name: str
    gender: GenderEnum
    segment_ids: List[UUID]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
