from pydantic import BaseModel, EmailStr

from app.schemas.common import MessageResponse  # noqa: F401 — re-exported for backwards compat


class RequestEmailVerificationRequest(BaseModel):
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    token: str



