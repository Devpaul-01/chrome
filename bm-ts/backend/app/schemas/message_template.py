"""
schemas/message_template.py — Pydantic schemas for user-authored message templates.

  MessageTemplateCreate  — POST /api/message-templates body
  MessageTemplateUpdate  — PUT  /api/message-templates/{id} body (all fields optional)
  MessageTemplateOut     — full template response (ORM-mapped)

``GenderEnum`` controls which contacts the template is targeted at when
the scheduler selects templates for a given birthday run.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.enums import GenderEnum


class MessageTemplateCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    greeting: str = Field(..., min_length=1, max_length=500)
    sentiment: str = Field(..., min_length=1, max_length=1000)
    closing: str = Field(..., min_length=1, max_length=500)
    image_url: Optional[str] = None
    days_in_advance: int = Field(default=0, ge=-30, le=30)
    gender: GenderEnum = Field(default=GenderEnum.ALL)


class MessageTemplateUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    greeting: Optional[str] = Field(None, min_length=1, max_length=500)
    sentiment: Optional[str] = Field(None, min_length=1, max_length=1000)
    closing: Optional[str] = Field(None, min_length=1, max_length=500)
    image_url: Optional[str] = None
    days_in_advance: Optional[int] = Field(None, ge=-30, le=30)
    gender: Optional[GenderEnum] = None


class MessageTemplateOut(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    greeting: str
    sentiment: str
    closing: str
    image_url: Optional[str]
    days_in_advance: int
    gender: GenderEnum
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
