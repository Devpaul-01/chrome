from pydantic import BaseModel, EmailStr


class RequestEmailVerificationRequest(BaseModel):
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    token: str


class MessageResponse(BaseModel):
    message: str
