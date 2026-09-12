"""
schemas/message_group.py — Pydantic schemas for message-group CRUD endpoints.

A ``MessageGroup`` is a named tag/label with a color that can be assigned
to templates, posts, and contacts for organising birthday messages.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MessageGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    color: str = Field(default="#6b7280", max_length=20)


class MessageGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    color: Optional[str] = Field(None, max_length=20)


class MessageGroupOut(BaseModel):
    id: UUID
    name: str
    color: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
