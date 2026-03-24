"""
services/stripe.py — Stripe API integration helpers.

Handles:
  - Creating Stripe Checkout Sessions for monthly and yearly subscription plans.
  - Constructing and validating incoming Stripe webhook events.
  - Upserting ``SubscriptionRecord`` rows from webhook payloads so the local
    database always mirrors Stripe's subscription state.

The Stripe SDK calls are wrapped in ``run_in_threadpool`` because the SDK is
not async-native; wrapping prevents them from blocking the async event loop.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping
from urllib.parse import urlparse
from uuid import UUID

import stripe
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import SubscriptionRecord, User

stripe.api_key = settings.stripe_api_key


def _validate_redirect_url(url: str, label: str = "URL") -> None:
    """Validate that a Stripe redirect URL points to an allowed domain."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label}: malformed URL",
        )
    if parsed.scheme not in ("https", "http"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label}: scheme must be http or https",
        )
    hostname = parsed.hostname or ""
    allowed = settings.stripe_redirect_allowed_domains
    if not any(hostname == d or hostname.endswith(f".{d}") for d in allowed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label}: domain not in allowlist",
        )


def _timestamp(value: int | None) -> datetime | None:
    """Convert a Unix timestamp integer to a UTC-aware ``datetime``, or ``None`` if the value is absent."""
    if value is None:
        return None
    return datetime.fromtimestamp(value, tz=timezone.utc)


def get_price_id(plan: str) -> str:
    """Map ``"monthly"`` / ``"yearly"`` to the corresponding Stripe price ID from settings."""
    mapping = {
        "monthly": settings.stripe_price_monthly,
        "yearly": settings.stripe_price_yearly,
    }
    if plan not in mapping:
        raise ValueError(f"invalid plan {plan}")
    return mapping[plan]


async def create_checkout_session(
    *,
    user: User,
    plan: str,
    success_url: str,
    cancel_url: str,
    db: AsyncSession,
) -> str:
    """
    Create a Stripe Checkout Session for the given ``plan`` and return its URL.

    If the user does not yet have a ``stripe_customer_id``, a Stripe Customer
    is created and the ID is persisted before the session is created.

    Redirect URLs are validated against an allowlist to prevent open-redirect attacks.
    """
    # Validate redirect URLs against the configured allowlist
    _validate_redirect_url(success_url, "success_url")
    _validate_redirect_url(cancel_url, "cancel_url")

    if not user.stripe_customer_id:
        customer = await run_in_threadpool(stripe.Customer.create, email=user.email)
        user.stripe_customer_id = customer["id"]
        await db.commit()
        await db.refresh(user)

    price_id = get_price_id(plan)
    session = await run_in_threadpool(
        stripe.checkout.Session.create,
        customer=user.stripe_customer_id,
        payment_method_types=["card"],
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url


async def cancel_subscription(stripe_subscription_id: str) -> dict:
    """
    Cancel a Stripe subscription at the end of the current billing period.

    Sets ``cancel_at_period_end=True`` so the user retains access until the
    period expires.  The webhook handler will pick up the resulting
    ``customer.subscription.updated`` event and persist the change locally.
    """
    sub = await run_in_threadpool(
        stripe.Subscription.modify,
        stripe_subscription_id,
        cancel_at_period_end=True,
    )
    return dict(sub)


async def reactivate_subscription(stripe_subscription_id: str) -> dict:
    """Undo a pending cancellation by clearing ``cancel_at_period_end``."""
    sub = await run_in_threadpool(
        stripe.Subscription.modify,
        stripe_subscription_id,
        cancel_at_period_end=False,
    )
    return dict(sub)


async def change_subscription_plan(
    stripe_subscription_id: str, new_price_id: str
) -> dict:
    """
    Upgrade or downgrade a subscription by swapping the price on
    the first subscription item.  Stripe prorates the charge automatically.
    """
    sub = await run_in_threadpool(stripe.Subscription.retrieve, stripe_subscription_id)
    item_id = sub["items"]["data"][0]["id"]
    updated = await run_in_threadpool(
        stripe.Subscription.modify,
        stripe_subscription_id,
        items=[{"id": item_id, "price": new_price_id}],
        proration_behavior="create_prorations",
    )
    return dict(updated)


async def create_billing_portal_session(
    stripe_customer_id: str, return_url: str
) -> str:
    """
    Create a Stripe Customer Portal session so the user can manage
    payment methods, invoices, and billing details.
    """
    _validate_redirect_url(return_url, "return_url")
    session = await run_in_threadpool(
        stripe.billing_portal.Session.create,
        customer=stripe_customer_id,
        return_url=return_url,
    )
    return session.url


def construct_event(payload: bytes, signature: str) -> stripe.Event:
    """Verify the Stripe-Signature header and return a parsed ``stripe.Event``. Raises on invalid signature."""
    return stripe.Webhook.construct_event(
        payload=payload,
        sig_header=signature,
        secret=settings.stripe_webhook_secret,
    )


async def sync_subscription_record(
    db: AsyncSession, user_id: UUID, data: Mapping[str, Any], metadata: Mapping[str, Any]
) -> SubscriptionRecord:
    """
    Upsert a ``SubscriptionRecord`` from a Stripe subscription object.

    If the incoming status is ``ACTIVE`` any other active subscriptions for the
    same user are transitioned to ``PAST_DUE`` first, enforcing the one-active-
    subscription-per-user invariant at the application level as a safety net.
    """
    if data.get("status") == "ACTIVE":
        await db.execute(
            update(SubscriptionRecord)
            .where(
                SubscriptionRecord.user_id == user_id,
                SubscriptionRecord.status == "ACTIVE",
                SubscriptionRecord.stripe_subscription_id != data.get("id"),
            )
            .values(status="PAST_DUE", updated_at=datetime.now(timezone.utc))
        )

    result = await db.execute(
        select(SubscriptionRecord).where(
            SubscriptionRecord.stripe_subscription_id == data["id"]
        )
    )
    record = result.scalar_one_or_none()
    payload = {
        "user_id": user_id,
        "status": data.get("status"),
        "price_id": data.get("items", {}).get("data", [])[0].get("price", {}).get("id")
        if data.get("items")
        else None,
        "stripe_subscription_id": data.get("id"),
        "stripe_customer_id": data.get("customer"),
        "current_period_start": _timestamp(data.get("current_period_start")),
        "current_period_end": _timestamp(data.get("current_period_end")),
        "cancel_at_period_end": data.get("cancel_at_period_end", False),
        "canceled_at": _timestamp(data.get("canceled_at")),
        "trial_end": _timestamp(data.get("trial_end")),
        "started_at": _timestamp(data.get("start_date")) if data.get("start_date") else None,
        "ended_at": _timestamp(data.get("ended_at")),
        "metadata_payload": metadata,
    }

    if record:
        for key, value in payload.items():
            setattr(record, key, value)
        record.updated_at = datetime.now(timezone.utc)
    else:
        record = SubscriptionRecord(**payload)
        db.add(record)
    await db.commit()
    await db.refresh(record)
    return record
