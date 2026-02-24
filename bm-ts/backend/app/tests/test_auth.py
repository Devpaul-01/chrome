"""
tests/test_auth.py — Unit tests for JWT token creation and validation.

Tests cover:
  - Access token carries the correct ``type`` claim and ``sub`` (user ID)
  - Refresh token type is accepted by ``ensure_token_type`` for REFRESH
    and rejected when checked against ACCESS
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from jose import JWTError

from app.core.jwt import TokenType, create_access_token, create_refresh_token, decode_token, ensure_token_type


def test_access_token_contains_access_type() -> None:
    """Access token payload must carry type=ACCESS and the correct subject UUID."""
    user_id = uuid4()
    token = create_access_token(user_id)
    payload = decode_token(token)
    assert payload["type"] == TokenType.ACCESS
    assert payload["sub"] == str(user_id)


def test_refresh_token_type_validation() -> None:
    """Refresh token must be accepted as REFRESH and rejected when asserted as ACCESS."""
    user_id = uuid4()
    refresh_token = create_refresh_token(user_id)
    payload = decode_token(refresh_token)
    ensure_token_type(payload, TokenType.REFRESH)
    with pytest.raises(JWTError):
        ensure_token_type(payload, TokenType.ACCESS)
