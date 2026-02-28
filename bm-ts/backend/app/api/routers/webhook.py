"""
api/routers/webhook.py — Stripe webhook handler.

Mounted under ``/stripe`` (set in main.py).

Endpoints
---------
POST /stripe/webhook   Verify the Stripe-Signature header, parse the event,
                       and update the local subscription record for the
                       relevant user on subscription lifecycle events.

Only ``customer.subscription.created``, ``customer.subscription.updated``,
and ``customer.subscription.deleted`` events are acted upon; all other event
types return ``{"received": True}`` immediately.

The payload is validated via Stripe's HMAC signature before any database
operations are performed, so spoofed requests are rejected before touching data.
"""

from __future__ import annotations

from typing import Mapping

from fastapi import APIRouter, Depends, HTTPException, Request, status
from http import HTTPStatus
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.session import get_db
from app.services.stripe import construct_event, sync_subscription_record

router = APIRouter()


@router.post("/webhook")
async def stripe_webhook(
    request: Request, db: AsyncSession = Depends(get_db)
) -> Mapping[str, bool]:
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    if not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature")

    try:
        event = construct_event(payload, signature)
    except ValueError:
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="Invalid payload")
    except Exception:
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="Invalid signature")

    object_data = event.data.object
    if event.type not in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        return {"received": True}

    customer_id = object_data.get("customer")
    if not customer_id:
        return {"received": True}

    result = await db.execute(select(User).where(User.stripe_customer_id == customer_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"received": True}

    metadata = object_data.get("metadata") or {}
    await sync_subscription_record(db, user.id, object_data, dict(metadata))
    return {"received": True}
