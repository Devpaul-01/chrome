from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, constr


class GenderEnum(str, Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    NEUTRAL = "NEUTRAL"
    ALL = "ALL"


class PostCreate(BaseModel):
    content: constr(strip_whitespace=True, min_length=1)
    gender: GenderEnum = GenderEnum.NEUTRAL
    image_url: Optional[str] = None
    label: Optional[str] = Field(None, max_length=255)
    font_family: Optional[str] = Field("Arial", max_length=100)
    font_size: Optional[int] = Field(48, ge=24, le=96)
    font_color: Optional[str] = Field("#ffffff", max_length=20)


class PostUpdate(BaseModel):
    content: Optional[constr(strip_whitespace=True, min_length=1)] = None
    gender: Optional[GenderEnum] = None
    image_url: Optional[str] = None
    label: Optional[str] = None
    font_family: Optional[str] = Field(None, max_length=100)
    font_size: Optional[int] = Field(None, ge=24, le=96)
    font_color: Optional[str] = Field(None, max_length=20)


class PostOut(BaseModel):
    id: UUID
    content: str
    gender: GenderEnum
    image_url: Optional[str]
    label: Optional[str]
    font_family: Optional[str]
    font_size: Optional[int]
    font_color: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
