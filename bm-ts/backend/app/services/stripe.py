from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import UUID

import stripe
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import SubscriptionRecord, User

stripe.api_key = settings.stripe_api_key


def _timestamp(value: int | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value, tz=timezone.utc)


def get_price_id(plan: str) -> str:
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


def construct_event(payload: bytes, signature: str) -> stripe.Event:
    return stripe.Webhook.construct_event(
        payload=payload,
        sig_header=signature,
        secret=settings.stripe_webhook_secret,
    )


async def sync_subscription_record(
    db: AsyncSession, user_id: UUID, data: Mapping[str, Any], metadata: Mapping[str, Any]
) -> SubscriptionRecord:
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
