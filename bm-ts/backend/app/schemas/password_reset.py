"""
schemas/password_reset.py — Pydantic schemas for password-reset and change-password flows.

  RequestPasswordResetRequest  — POST /auth/request-password-reset body
  ResetPasswordRequest         — POST /auth/reset-password body
  ChangePasswordRequest        — POST /auth/change-password body
  MessageResponse              — generic ``{"message": str}`` response reused across several routes
"""

from pydantic import BaseModel, EmailStr, constr

from app.schemas.common import MessageResponse  # noqa: F401 — re-exported for backwards compat


class RequestPasswordResetRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: constr(min_length=8, max_length=128) = ...  # Enforce length bounds


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: constr(min_length=8, max_length=128) = ...  # Enforce length bounds
