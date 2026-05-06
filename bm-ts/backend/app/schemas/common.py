"""
schemas/common.py — Shared response models used across multiple routers.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class DeleteResponse(BaseModel):
    status: str = "deleted"


class FieldError(BaseModel):
    """A single field-level validation error."""

    field: str
    message: str


class ErrorResponse(BaseModel):
    """Standardized error response returned by all non-DELETE endpoints."""

    detail: str
    code: str
    timestamp: datetime
    errors: Optional[List[FieldError]] = None


class MessageResponse(BaseModel):
    message: str
