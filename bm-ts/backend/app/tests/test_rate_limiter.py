"""Tests for app.core.rate_limiter — key function and init wiring."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.core.rate_limiter import fb_user_key, init_rate_limiter, limiter


class TestFbUserKey:
    """Verify the rate-limit key resolution order: fb_user_id → IP → anonymous."""

    def _make_request(self, fb_user_id=None, client_host="127.0.0.1"):
        req = MagicMock()
        req.state = MagicMock()
        if fb_user_id is not None:
            req.state.fb_user_id = fb_user_id
        else:
            # Simulate missing attribute
            del req.state.fb_user_id
        req.client = MagicMock()
        req.client.host = client_host
        return req

    def test_returns_fb_user_id_when_present(self):
        req = self._make_request(fb_user_id="fb_12345")
        assert fb_user_key(req) == "fb_12345"

    def test_falls_back_to_ip(self):
        req = self._make_request(fb_user_id=None, client_host="10.0.0.1")
        assert fb_user_key(req) == "10.0.0.1"

    def test_falls_back_to_anonymous(self):
        req = MagicMock()
        req.state = MagicMock(spec=[])  # no fb_user_id attribute
        with patch("app.core.rate_limiter.get_remote_address", return_value=None):
            assert fb_user_key(req) == "anonymous"

    def test_prefers_fb_id_over_ip(self):
        req = self._make_request(fb_user_id="fb_99", client_host="192.168.1.1")
        assert fb_user_key(req) == "fb_99"


class TestInitRateLimiter:
    def test_attaches_middleware_and_handler(self):
        app = MagicMock()
        init_rate_limiter(app)

        assert app.state.limiter is limiter
        app.add_exception_handler.assert_called_once()
        app.add_middleware.assert_called_once()
