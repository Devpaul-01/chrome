"""
schemas/template.py — Pydantic schemas for template-segment CRUD endpoints.

  SegmentTypeEnum       — GREETING / BODY / CLOSING segment classifications
  TemplateSegmentCreate — POST /templates/ body
  TemplateSegmentUpdate — PUT  /templates/{id} body (content/label optional)
  TemplateSegmentOut    — full segment response (ORM-mapped)

Segments are composed into birthday messages at send-time by
``services/templates.py::compose_message``.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.core.validators import sanitize_text


class SegmentTypeEnum(str, Enum):
    GREETING = "GREETING"
    BODY = "BODY"
    CLOSING = "CLOSING"


class TemplateSegmentCreate(BaseModel):
    segment_type: SegmentTypeEnum
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    label: Optional[str] = Field(None, max_length=64)

    _sanitize_content = field_validator("content", mode="after")(sanitize_text)

    @field_validator("label", mode="after")
    @classmethod
    def sanitize_label(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v) if v is not None else v


class TemplateSegmentUpdate(BaseModel):
    content: Optional[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    ] = None
    label: Optional[str] = Field(None, max_length=64)

    @field_validator("content", "label", mode="after")
    @classmethod
    def sanitize_optional(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v) if v is not None else v


class TemplateSegmentOut(BaseModel):
    id: UUID
    segment_type: SegmentTypeEnum
    content: str
    label: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
