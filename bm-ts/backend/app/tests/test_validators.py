"""Tests for app.core.validators — input sanitization helpers."""

from __future__ import annotations

import pytest

from app.core.validators import MAX_TEXT_LENGTH, sanitize_text


class TestSanitizeText:
    def test_strips_whitespace(self):
        assert sanitize_text("  hello  ") == "hello"

    def test_strips_newlines_and_tabs(self):
        assert sanitize_text("\n\thello\n") == "hello"

    def test_rejects_null_bytes(self):
        with pytest.raises(ValueError, match="null bytes"):
            sanitize_text("bad\x00string")

    def test_rejects_overlong_text(self):
        with pytest.raises(ValueError, match="exceed"):
            sanitize_text("x" * (MAX_TEXT_LENGTH + 1))

    def test_allows_max_length_exactly(self):
        text = "a" * MAX_TEXT_LENGTH
        assert sanitize_text(text) == text

    def test_empty_string_allowed(self):
        assert sanitize_text("") == ""

    def test_plain_text_unchanged(self):
        assert sanitize_text("Hello World") == "Hello World"

    def test_non_string_passthrough(self):
        # The function guards with isinstance — non-strings are returned as-is
        assert sanitize_text(123) == 123  # type: ignore[arg-type]

    def test_unicode_preserved(self):
        assert sanitize_text("  café ☕  ") == "café ☕"

    def test_only_whitespace_becomes_empty(self):
        assert sanitize_text("   \t\n  ") == ""
