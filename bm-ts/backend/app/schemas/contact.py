"""
schemas/contact.py — Pydantic schemas for the contacts CRUD endpoints.

  ContactCreate  — POST /api/contacts/ body
  ContactUpdate  — PUT  /api/contacts/{id} body (all fields optional)
  ContactOut     — response model (ORM-mapped; camelCase aliases for ``createdAt``/``updatedAt``)
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import sanitize_text
from app.schemas.enums import GenderEnum


class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    facebook_profile_url: str = Field(..., min_length=1)
    birthday: datetime
    birthday_month_only: bool = False
    gender: Optional[GenderEnum] = None
    notes: Optional[str] = None
    group_id: Optional[UUID] = None

    _sanitize = field_validator("name", "facebook_profile_url", mode="after")(
        sanitize_text
    )

    @field_validator("notes", mode="after")
    @classmethod
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v) if v is not None else v


class ContactUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    facebook_profile_url: Optional[str] = Field(None, min_length=1)
    birthday: Optional[datetime] = None
    birthday_month_only: Optional[bool] = None
    gender: Optional[GenderEnum] = None
    notes: Optional[str] = None
    group_id: Optional[UUID] = None

    @field_validator("name", "facebook_profile_url", "notes", mode="after")
    @classmethod
    def sanitize_optional(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v) if v is not None else v


class ContactOut(BaseModel):
    id: UUID
    name: str
    facebook_profile_url: str
    birthday: datetime
    birthday_month_only: bool
    gender: Optional[GenderEnum]
    notes: Optional[str]
    group_id: Optional[UUID]
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
