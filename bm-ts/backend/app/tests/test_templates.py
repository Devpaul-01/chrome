from __future__ import annotations

import pytest

from app.services.templates import compose_message


def test_compose_message_requires_segments() -> None:
    with pytest.raises(ValueError):
        compose_message([], ["body"], ["closing"])


def test_compose_message_returns_combined_text() -> None:
    result = compose_message(["Hello"], ["Hope you well"], ["Cheers"])
    assert "Hello" in result
    assert "Hope you well" in result
    assert "Cheers" in result
