"""
api/routers/webhook.py — Stripe webhook handler.

Mounted under ``/stripe`` (set in main.py).

Endpoints
---------
POST /stripe/webhook   Verify the Stripe-Signature header, parse the event,
                       and update the local subscription record for the
                       relevant user on subscription lifecycle events.

Handled event types:
  - ``customer.subscription.created``   → upsert subscription record (ACTIVE)
  - ``customer.subscription.updated``   → sync changes (cancel, plan swap, etc.)
  - ``customer.subscription.deleted``   → mark subscription CANCELED
  - ``invoice.payment_failed``          → transition subscription to PAST_DUE

All other event types return ``{"received": True}`` immediately.

The payload is validated via Stripe's HMAC signature before any database
operations are performed, so spoofed requests are rejected before touching data.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Mapping

from fastapi import APIRouter, Depends, HTTPException, Request, status
from http import HTTPStatus
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import SubscriptionRecord, User
from app.db.session import get_db
from app.services.stripe import construct_event, sync_subscription_record

router = APIRouter()

_SUBSCRIPTION_EVENTS = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
}


async def _handle_payment_failed(
    db: AsyncSession,
    event_data: dict,
) -> None:
    """
    Handle ``invoice.payment_failed`` by transitioning the related
    subscription to ``PAST_DUE``.  This begins the grace period — the
    user retains access until ``current_period_end`` passes.

    Stripe's Smart Retries will continue attempting payment automatically;
    a later ``customer.subscription.updated`` event with status ``active``
    would transition the record back if a retry succeeds.
    """
    subscription_id = event_data.get("subscription")
    if not subscription_id:
        return

    await db.execute(
        update(SubscriptionRecord)
        .where(
            SubscriptionRecord.stripe_subscription_id == subscription_id,
            SubscriptionRecord.status == "ACTIVE",
        )
        .values(status="PAST_DUE", updated_at=datetime.now(timezone.utc))
    )
    await db.commit()


@router.post("/webhook")
async def stripe_webhook(
    request: Request, db: AsyncSession = Depends(get_db)
) -> Mapping[str, bool]:
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature"
        )

    try:
        event = construct_event(payload, signature)
    except ValueError:
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST, detail="Invalid payload"
        )
    except Exception:
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST, detail="Invalid signature"
        )

    object_data = event.data.object

    # --- invoice.payment_failed ---
    if event.type == "invoice.payment_failed":
        await _handle_payment_failed(db, object_data)
        return {"received": True}

    # --- subscription lifecycle events ---
    if event.type not in _SUBSCRIPTION_EVENTS:
        return {"received": True}

    customer_id = object_data.get("customer")
    if not customer_id:
        return {"received": True}

    result = await db.execute(
        select(User).where(User.stripe_customer_id == customer_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        return {"received": True}

    metadata = object_data.get("metadata") or {}
    await sync_subscription_record(db, user.id, object_data, dict(metadata))
    return {"received": True}
