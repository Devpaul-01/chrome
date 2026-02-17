from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt

from app.core.config import settings


class TokenType:
    ACCESS = "access"
    REFRESH = "refresh"


def _build_payload(subject: UUID, token_type: str, expires_delta: timedelta) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return payload


def create_access_token(subject: UUID) -> str:
    expires = timedelta(minutes=settings.access_token_expire_minutes)
    payload = _build_payload(subject, TokenType.ACCESS, expires)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: UUID) -> str:
    expires = timedelta(days=settings.refresh_token_expire_days)
    payload = _build_payload(subject, TokenType.REFRESH, expires)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise JWTError("Token validation failed") from exc


def ensure_token_type(payload: dict[str, Any], expected_type: str) -> None:
    token_type = payload.get("type")
    if token_type != expected_type:
        raise JWTError("unexpected token type")
