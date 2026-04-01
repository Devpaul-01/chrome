"""Tests for app.services.stripe — Stripe integration helpers.

All Stripe SDK calls are mocked so no real API key is needed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.stripe import (
    _timestamp,
    _validate_redirect_url,
    get_price_id,
)


# ── Helper tests ──────────────────────────────────────────────────────────────

class TestTimestamp:
    def test_none_returns_none(self):
        assert _timestamp(None) is None

    def test_converts_unix_to_utc_datetime(self):
        ts = 1700000000
        result = _timestamp(ts)
        assert isinstance(result, datetime)
        assert result.tzinfo is timezone.utc
        assert result == datetime.fromtimestamp(ts, tz=timezone.utc)

    def test_zero_epoch(self):
        assert _timestamp(0) == datetime(1970, 1, 1, tzinfo=timezone.utc)


class TestGetPriceId:
    def test_monthly(self):
        price = get_price_id("monthly")
        assert isinstance(price, str)
        assert len(price) > 0

    def test_yearly(self):
        price = get_price_id("yearly")
        assert isinstance(price, str)
        assert len(price) > 0

    def test_invalid_plan_raises(self):
        with pytest.raises(ValueError, match="invalid plan"):
            get_price_id("weekly")


class TestValidateRedirectUrl:
    def test_valid_url_passes(self):
        # Should not raise — localhost is in the default allowlist
        _validate_redirect_url("http://localhost:3000/success")

    def test_invalid_scheme_rejected(self):
        with pytest.raises(HTTPException) as exc_info:
            _validate_redirect_url("ftp://evil.com/steal")
        assert exc_info.value.status_code == 400

    def test_disallowed_domain_rejected(self):
        with pytest.raises(HTTPException) as exc_info:
            _validate_redirect_url("https://evil.example.com/steal")
        assert exc_info.value.status_code == 400

    def test_malformed_url_rejected(self):
        with pytest.raises(HTTPException) as exc_info:
            _validate_redirect_url("://broken")
        assert exc_info.value.status_code == 400


# ── Async service tests ──────────────────────────────────────────────────────

class TestCancelSubscription:
    @pytest.mark.asyncio
    async def test_sets_cancel_at_period_end(self):
        mock_sub = {"id": "sub_123", "cancel_at_period_end": True}
        with patch("app.services.stripe.run_in_threadpool", new_callable=AsyncMock, return_value=mock_sub):
            from app.services.stripe import cancel_subscription
            result = await cancel_subscription("sub_123")
            assert result["cancel_at_period_end"] is True


class TestReactivateSubscription:
    @pytest.mark.asyncio
    async def test_clears_cancel_at_period_end(self):
        mock_sub = {"id": "sub_123", "cancel_at_period_end": False}
        with patch("app.services.stripe.run_in_threadpool", new_callable=AsyncMock, return_value=mock_sub):
            from app.services.stripe import reactivate_subscription
            result = await reactivate_subscription("sub_123")
            assert result["cancel_at_period_end"] is False


class TestChangeSubscriptionPlan:
    @pytest.mark.asyncio
    async def test_swaps_price(self):
        existing_sub = MagicMock()
        existing_sub.__getitem__ = lambda s, k: {"items": {"data": [{"id": "si_1"}]}}[k]
        updated_sub = {"id": "sub_123", "items": {"data": [{"id": "si_1", "price": {"id": "price_new"}}]}}

        async def side_effect(*args, **kwargs):
            # First call = retrieve, second call = modify
            if args[0] == "stripe.Subscription.retrieve" or "retrieve" in str(args[0]):
                return existing_sub
            return updated_sub

        with patch("app.services.stripe.run_in_threadpool", new_callable=AsyncMock) as mock_pool:
            mock_pool.side_effect = [existing_sub, updated_sub]
            from app.services.stripe import change_subscription_plan
            result = await change_subscription_plan("sub_123", "price_new")
            assert result["id"] == "sub_123"
            assert mock_pool.call_count == 2


class TestCreateCheckoutSession:
    @pytest.mark.asyncio
    async def test_creates_session_for_existing_customer(self):
        mock_user = MagicMock()
        mock_user.stripe_customer_id = "cus_abc"
        mock_user.email = "test@test.com"
        mock_db = AsyncMock()

        mock_session = MagicMock()
        mock_session.url = "https://checkout.stripe.com/session_xyz"

        with patch("app.services.stripe.run_in_threadpool", new_callable=AsyncMock, return_value=mock_session):
            from app.services.stripe import create_checkout_session
            url = await create_checkout_session(
                user=mock_user,
                plan="monthly",
                success_url="http://localhost:3000/success",
                cancel_url="http://localhost:3000/cancel",
                db=mock_db,
            )
            assert url == "https://checkout.stripe.com/session_xyz"

    @pytest.mark.asyncio
    async def test_creates_customer_if_missing(self):
        mock_user = MagicMock()
        mock_user.stripe_customer_id = None
        mock_user.email = "new@test.com"
        mock_db = AsyncMock()

        mock_customer = {"id": "cus_new"}
        mock_session = MagicMock()
        mock_session.url = "https://checkout.stripe.com/session_abc"

        with patch("app.services.stripe.run_in_threadpool", new_callable=AsyncMock) as mock_pool:
            mock_pool.side_effect = [mock_customer, mock_session]
            from app.services.stripe import create_checkout_session
            url = await create_checkout_session(
                user=mock_user,
                plan="yearly",
                success_url="http://localhost:3000/success",
                cancel_url="http://localhost:3000/cancel",
                db=mock_db,
            )
            assert url == "https://checkout.stripe.com/session_abc"
            assert mock_user.stripe_customer_id == "cus_new"
            mock_db.commit.assert_awaited_once()


class TestConstructEvent:
    def test_delegates_to_stripe_webhook(self):
        with patch("app.services.stripe.stripe.Webhook.construct_event") as mock_construct:
            mock_construct.return_value = MagicMock(type="checkout.session.completed")
            from app.services.stripe import construct_event
            event = construct_event(b"payload", "sig_header")
            assert event.type == "checkout.session.completed"
            mock_construct.assert_called_once()
