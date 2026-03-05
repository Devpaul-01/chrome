"""
schemas/auth.py — Pydantic schemas for authentication endpoints.

Schema hierarchy:
  RegisterRequest — POST /auth/register body
  LoginRequest    — POST /auth/login body
  RefreshRequest  — POST /auth/refresh body
  TokenResponse   — shared response for register / login / refresh
  UserProfile     — GET /auth/me response (ORM-mapped)
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, constr


class RegisterRequest(BaseModel):
    """Registration payload — email is validated as a proper address; password minimum 8 chars."""

    email: EmailStr
    password: constr(min_length=8) = Field(..., description="Minimum 8 characters")


class LoginRequest(BaseModel):
    """Login credentials — email + plaintext password."""

    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    """Holds the opaque refresh token returned by register/login."""

    refresh_token: str


class TokenResponse(BaseModel):
    """JWT token pair returned on successful register, login, or refresh."""

    access_token: str
    refresh_token: str
    token_type: str = Field(default="bearer")


class UserProfile(BaseModel):
    """Public profile returned by GET /auth/me.  ORM-mapped from the ``User`` model."""

    id: UUID
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeleteAccountRequest(BaseModel):
    """Payload for DELETE /auth/account — requires password confirmation."""

    current_password: str
