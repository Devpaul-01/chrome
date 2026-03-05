"""
schemas/smtp.py — Pydantic schemas for SMTP configuration and user-profile update.

  SMTPConfigUpdate   — POST/PUT /smtp/config body
  SMTPConfigOut      — GET  /smtp/config response (ORM-mapped)
  UserProfileUpdate  — PATCH /auth/profile body

Note: ``SMTPConfigOut`` currently exposes the plaintext password field.
This should be masked or omitted before the API is made public.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SMTPConfigUpdate(BaseModel):
    host: str = Field(..., min_length=1)
    port: int = Field(..., ge=1, le=65535)
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    use_tls: bool = True
    from_email: EmailStr
    from_name: Optional[str] = None


class SMTPConfigOut(BaseModel):
    host: str
    port: int
    username: str
    password: str = ""  # Masked in serialization — never expose the real password
    use_tls: bool
    from_email: str
    from_name: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    def model_post_init(self, __context: Any) -> None:
        """Mask the SMTP password so it is never returned via the API."""
        if self.password:
            object.__setattr__(self, "password", "••••••••")


class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    timezone: Optional[str] = Field(None, max_length=100)
