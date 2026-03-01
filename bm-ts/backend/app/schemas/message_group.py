"""
schemas/message_group.py — Pydantic schemas for message-group CRUD endpoints.

  MessageGroupCreate  — POST /api/message-groups body
  MessageGroupUpdate  — PUT  /api/message-groups/{id} body (all fields optional)
  MessageGroupOut     — full group response including resolved segment_ids (ORM-mapped)

A ``MessageGroup`` bundles a named set of template-segment UUIDs together so
the scheduler can pick a random combination for a given gender filter.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.enums import GenderEnum


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
