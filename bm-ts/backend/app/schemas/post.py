"""
schemas/post.py — Pydantic schemas for timeline post CRUD endpoints.

  PostCreate  — POST /api/posts body
  PostUpdate  — PUT  /api/posts/{id} body (all fields optional)
  PostOut     — response model with font customisation fields (ORM-mapped)

Font fields (``font_family``, ``font_size``, ``font_color``) are used by the
extension's canvas compositor (``utils/image.ts``) when attaching an image
overlay to a timeline post.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, constr, field_validator

from app.core.validators import sanitize_text
from app.schemas.enums import GenderEnum


class PostCreate(BaseModel):
    content: constr(strip_whitespace=True, min_length=1)
    gender: GenderEnum = GenderEnum.NEUTRAL
    image_url: Optional[str] = None
    label: Optional[str] = Field(None, max_length=255)

    _sanitize_content = field_validator("content", mode="after")(sanitize_text)

    @field_validator("label", mode="after")
    @classmethod
    def sanitize_label(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v) if v is not None else v
    font_family: Optional[str] = Field("Arial", max_length=100)
    font_size: Optional[int] = Field(48, ge=24, le=96)
    font_color: Optional[str] = Field("#ffffff", max_length=20)


class PostUpdate(BaseModel):
    content: Optional[constr(strip_whitespace=True, min_length=1)] = None
    gender: Optional[GenderEnum] = None
    image_url: Optional[str] = None
    label: Optional[str] = None

    @field_validator("content", "label", mode="after")
    @classmethod
    def sanitize_optional(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v) if v is not None else v
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
