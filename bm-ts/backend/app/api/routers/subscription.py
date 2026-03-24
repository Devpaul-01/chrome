"""
api/routers/subscription.py — Stripe subscription lifecycle endpoints.

Mounted under ``/subscription`` (set in main.py).

Endpoints
---------
GET  /subscription/status                   Return the user's current subscription status.
POST /subscription/create-checkout-session   Create a Stripe Checkout Session URL.
POST /subscription/cancel                    Cancel at end of billing period.
POST /subscription/reactivate               Undo a pending cancellation.
POST /subscription/change-plan              Upgrade or downgrade the subscription plan.
POST /subscription/billing-portal           Open the Stripe Customer Portal.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import SubscriptionRecord, User
from app.db.session import get_db
from app.schemas.subscription import (
    BillingPortalResponse,
    CancelSubscriptionResponse,
    ChangePlanRequest,
    ChangePlanResponse,
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    SubscriptionStatusResponse,
)
from app.services.stripe import (
    cancel_subscription,
    change_subscription_plan,
    create_billing_portal_session,
    create_checkout_session,
    get_price_id,
    reactivate_subscription,
)

router = APIRouter()


def _infer_plan(price_id: str | None) -> str | None:
    """Map a Stripe price ID to a plan label (``"monthly"`` or ``"yearly"``), or ``None`` if unrecognised."""
    mapping = {
        settings.stripe_price_monthly: "monthly",
        settings.stripe_price_yearly: "yearly",
    }
    if price_id is None:
        return None
    return mapping.get(price_id)


@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionStatusResponse:
    """Return the most recent subscription record for the current user, or ``is_active=False`` if none exists."""
    stmt = (
        select(SubscriptionRecord)
        .where(SubscriptionRecord.user_id == current_user.id)
        .order_by(desc(SubscriptionRecord.updated_at))
        .limit(1)
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if not record:
        return SubscriptionStatusResponse(
            is_active=False, plan=None, status=None,
            current_period_end=None, stripe_customer_id=None,
            stripe_subscription_id=None,
        )

    is_active = record.status in ("ACTIVE", "TRIALING")
    now = datetime.now(timezone.utc)
    period_end = record.current_period_end
    if period_end is not None and period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)
    in_grace_period = (
        record.status == "PAST_DUE"
        and period_end is not None
        and period_end > now
    )

    return SubscriptionStatusResponse(
        is_active=is_active or in_grace_period,
        plan=_infer_plan(record.price_id),
        status=record.status,
        current_period_end=record.current_period_end,
        cancel_at_period_end=record.cancel_at_period_end,
        canceled_at=record.canceled_at,
        in_grace_period=in_grace_period,
        stripe_customer_id=record.stripe_customer_id,
        stripe_subscription_id=record.stripe_subscription_id,
    )


@router.post("/create-checkout-session", response_model=CheckoutSessionResponse)
async def create_session(
    data: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckoutSessionResponse:
    session_url = await create_checkout_session(
        user=current_user,
        plan=data.plan,
        success_url=str(data.success_url),
        cancel_url=str(data.cancel_url),
        db=db,
    )
    return CheckoutSessionResponse(checkout_url=session_url)


# -- helpers -----------------------------------------------------------------

async def _get_active_record(
    user: User, db: AsyncSession
) -> SubscriptionRecord:
    """Return the user's active subscription record or raise 404."""
    stmt = (
        select(SubscriptionRecord)
        .where(
            SubscriptionRecord.user_id == user.id,
            SubscriptionRecord.status.in_(["ACTIVE", "TRIALING"]),
        )
        .limit(1)
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active subscription")
    return record


# -- cancellation / reactivation -------------------------------------------

@router.post("/cancel", response_model=CancelSubscriptionResponse)
async def cancel(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CancelSubscriptionResponse:
    """Cancel the current subscription at the end of the billing period."""
    record = await _get_active_record(current_user, db)
    await cancel_subscription(record.stripe_subscription_id)
    # Optimistic local update (webhook will confirm)
    record.cancel_at_period_end = True
    await db.commit()
    await db.refresh(record)
    return CancelSubscriptionResponse(
        status=record.status,
        cancel_at_period_end=True,
        current_period_end=record.current_period_end,
        message="Subscription will be canceled at the end of the current billing period.",
    )


@router.post("/reactivate", response_model=CancelSubscriptionResponse)
async def reactivate(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CancelSubscriptionResponse:
    """Undo a pending cancellation so the subscription renews normally."""
    record = await _get_active_record(current_user, db)
    if not record.cancel_at_period_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription is not pending cancellation",
        )
    await reactivate_subscription(record.stripe_subscription_id)
    record.cancel_at_period_end = False
    await db.commit()
    await db.refresh(record)
    return CancelSubscriptionResponse(
        status=record.status,
        cancel_at_period_end=False,
        current_period_end=record.current_period_end,
        message="Subscription reactivated. It will renew at the end of the current period.",
    )


# -- upgrade / downgrade ---------------------------------------------------

@router.post("/change-plan", response_model=ChangePlanResponse)
async def change_plan(
    data: ChangePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChangePlanResponse:
    """Switch the subscription to a different plan (upgrade or downgrade)."""
    record = await _get_active_record(current_user, db)

    current_plan = _infer_plan(record.price_id)
    if current_plan == data.new_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Already on the {data.new_plan} plan",
        )

    new_price_id = get_price_id(data.new_plan)
    await change_subscription_plan(record.stripe_subscription_id, new_price_id)
    # Optimistic local update
    record.price_id = new_price_id
    await db.commit()
    await db.refresh(record)
    return ChangePlanResponse(
        status=record.status,
        new_plan=data.new_plan,
        message=f"Plan changed to {data.new_plan}. Proration will be applied.",
    )


# -- billing portal --------------------------------------------------------

@router.post("/billing-portal", response_model=BillingPortalResponse)
async def billing_portal(
    current_user: User = Depends(get_current_user),
) -> BillingPortalResponse:
    """Create a Stripe Customer Portal session for managing payment methods."""
    if not current_user.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No billing account found. Please set up a subscription first.",
        )
    portal_url = await create_billing_portal_session(
        stripe_customer_id=current_user.stripe_customer_id,
        return_url=f"https://{settings.stripe_redirect_allowed_domains[0]}",
    )
    return BillingPortalResponse(portal_url=portal_url)
