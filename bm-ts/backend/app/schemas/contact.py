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

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.schemas.enums import GenderEnum


class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    facebook_profile_url: str = Field(..., min_length=1)
    birthday: datetime
    gender: Optional[GenderEnum] = None
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    facebook_profile_url: Optional[str] = Field(None, min_length=1)
    birthday: Optional[datetime] = None
    gender: Optional[GenderEnum] = None
    notes: Optional[str] = None


class ContactOut(BaseModel):
    id: UUID
    name: str
    facebook_profile_url: str
    birthday: datetime
    gender: Optional[GenderEnum]
    notes: Optional[str]
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
