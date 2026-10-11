"""
schemas/user_image.py — Pydantic schemas for user-uploaded image endpoints.

  UserImageUploadUrl   — POST /images/url body  (upload by remote URL)
  UserImageUploadFile  — POST /images/upload body (upload by base64 payload, max 10 MB)
  UserImageOut         — unified response for both upload strategies (ORM-mapped)
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserImageUploadUrl(BaseModel):
    url: str = Field(..., min_length=1)
    source: Literal["library", "post"] = "library"


class UserImageUploadFile(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    data: str = Field(..., description="Base64 encoded image data")
    size: int = Field(
        ..., gt=0, le=10 * 1024 * 1024, description="File size in bytes, max 10MB"
    )
    source: Literal["library", "post"] = "library"


class UserImageOut(BaseModel):
    id: UUID
    url: str
    filename: str
    size: int
    source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
