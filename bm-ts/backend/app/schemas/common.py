"""
schemas/common.py — Shared response models used across multiple routers.
"""

from pydantic import BaseModel


class DeleteResponse(BaseModel):
    status: str = "deleted"


class ErrorResponse(BaseModel):
    detail: str


class MessageResponse(BaseModel):
    message: str
