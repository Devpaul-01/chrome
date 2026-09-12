"""
tests/test_templates.py — Unit tests for birthday message template composition.

Tests cover:
  - ``compose_message`` raises ``ValueError`` when any segment group is empty
  - ``compose_message`` correctly concatenates one segment from each group
"""

from __future__ import annotations

import pytest

from app.services.templates import compose_message


def test_compose_message_requires_segments() -> None:
    """An empty segment group must raise ValueError rather than silently producing a blank."""
    with pytest.raises(ValueError):
        compose_message([], ["body"], ["closing"])


def test_compose_message_returns_combined_text() -> None:
    """A valid call must return a string containing one segment from each input group."""
    result = compose_message(["Hello"], ["Hope you well"], ["Cheers"])
    assert "Hello" in result
    assert "Hope you well" in result
    assert "Cheers" in result
