from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserImageUploadUrl(BaseModel):
    url: str = Field(..., min_length=1)


class UserImageUploadFile(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    data: str = Field(..., description="Base64 encoded image data")
    size: int = Field(..., gt=0, le=5 * 1024 * 1024, description="File size in bytes, max 5MB")


class UserImageOut(BaseModel):
    id: UUID
    url: str
    filename: str
    size: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
