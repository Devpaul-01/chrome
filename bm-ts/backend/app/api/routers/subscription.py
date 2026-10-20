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
from typing import Any

from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, status

from app.core.errors import AppError, ErrorCodes

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import AccessEntitlement, RecurringSubscription, SubscriptionRecord, User
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
from app.services.paypal import cancel_recurring_subscription as cancel_paypal_subscription
from app.services.stripe import (
    cancel_subscription,
    change_subscription_plan,
    create_billing_portal_session,
    create_checkout_session,
    get_price_id,
    reactivate_subscription,
)
from app.schemas.common import ErrorResponse

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
}

router = APIRouter(responses=_ERROR_RESPONSES)


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
    """Return provider-neutral paid access first, then fall back to legacy Stripe state.

    ``AccessEntitlement`` is authoritative for application access regardless of
    whether the payment originated from BTCPay, Rapyd, Stripe, Monero, or a future
    provider. Legacy ``SubscriptionRecord`` rows remain supported during migration.
    """
    now = datetime.now(timezone.utc)
    entitlement_stmt = (
        select(AccessEntitlement)
        .where(
            AccessEntitlement.user_id == current_user.id,
            AccessEntitlement.status == "ACTIVE",
            AccessEntitlement.starts_at <= now,
            AccessEntitlement.expires_at > now,
        )
        .order_by(desc(AccessEntitlement.expires_at))
        .limit(1)
    )
    entitlement_result = await db.execute(entitlement_stmt)
    entitlement = entitlement_result.scalar_one_or_none()
    if entitlement is not None:
        # Authorization is based only on the entitlement active right now.
        # Subscription status additionally reports how far uninterrupted,
        # already-paid ACTIVE coverage extends through future renewal rows.
        paid_through = entitlement.expires_at
        coverage_plan = entitlement.plan_code

        future_result = await db.execute(
            select(AccessEntitlement)
            .where(
                AccessEntitlement.user_id == current_user.id,
                AccessEntitlement.status == "ACTIVE",
                AccessEntitlement.starts_at >= entitlement.expires_at,
            )
            .order_by(
                AccessEntitlement.starts_at.asc(),
                AccessEntitlement.expires_at.asc(),
            )
        )
        future_entitlements = future_result.scalars().all()

        for future in future_entitlements:
            future_starts = future.starts_at
            if future_starts > paid_through:
                # A real gap ends the customer's continuous paid-through chain.
                break
            if future.expires_at > paid_through:
                paid_through = future.expires_at
                coverage_plan = future.plan_code

        # Administrative grants never inherit historical provider billing identity.
        if entitlement.source_provider == "development_admin":
            return SubscriptionStatusResponse(
                is_active=True, plan=coverage_plan, status="ACTIVE",
                current_period_end=paid_through, cancel_at_period_end=False,
                canceled_at=None, in_grace_period=False,
                stripe_customer_id=None, stripe_subscription_id=None,
                billing_provider="development_admin", provider_subscription_id=None,
                auto_renew=False, next_billing_at=None,
            )

        # Only one eligible active PayPal agreement may be revised.
        agreements = (await db.execute(
            select(RecurringSubscription).where(
                RecurringSubscription.user_id == current_user.id,
                RecurringSubscription.provider == "paypal",
                RecurringSubscription.status == "ACTIVE",
                RecurringSubscription.cancel_at_period_end.is_(False),
            ).order_by(desc(RecurringSubscription.updated_at)).limit(2)
        )).scalars().all()
        recurring = agreements[0] if len(agreements) == 1 and agreements[0].provider_subscription_id else None
        if agreements:
            billing_provider = "paypal"
            provider_subscription_id = recurring.provider_subscription_id if recurring else None
        else:
            billing_provider = entitlement.source_provider
            provider_subscription_id = None
        return SubscriptionStatusResponse(
            is_active=True, plan=coverage_plan, status="ACTIVE",
            current_period_end=paid_through,
            cancel_at_period_end=bool(recurring.cancel_at_period_end) if recurring else False,
            canceled_at=None, in_grace_period=False,
            stripe_customer_id=None, stripe_subscription_id=None,
            billing_provider=billing_provider,
            provider_subscription_id=provider_subscription_id,
            auto_renew=bool(recurring),
            next_billing_at=recurring.next_billing_at if recurring else None,
        )

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
            is_active=False,
            plan=None,
            status=None,
            current_period_end=None,
            stripe_customer_id=None,
            stripe_subscription_id=None,
        )

    is_active = record.status in ("ACTIVE", "TRIALING")
    in_grace_period = False

    return SubscriptionStatusResponse(
        is_active=is_active,
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


async def _get_active_record(user: User, db: AsyncSession) -> SubscriptionRecord:
    """Return the user's ACTIVE/TRIALING Stripe subscription record or raise 404."""
    stmt = (
        select(SubscriptionRecord)
        .where(
            SubscriptionRecord.user_id == user.id,
            SubscriptionRecord.status.in_(["ACTIVE", "TRIALING"]),
        )
        .order_by(desc(SubscriptionRecord.updated_at))
        .limit(1)
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if not record:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.SUBSCRIPTION_NOT_FOUND,
            "No active subscription",
        )
    return record


# -- cancellation / reactivation -------------------------------------------


@router.post("/cancel", response_model=CancelSubscriptionResponse)
async def cancel(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CancelSubscriptionResponse:
    """Cancel the current subscription at the end of the billing period."""
    recurring = (await db.execute(select(RecurringSubscription).where(RecurringSubscription.user_id == current_user.id, RecurringSubscription.status.in_(["ACTIVE","APPROVAL_PENDING","PAYMENT_FAILED"])).order_by(desc(RecurringSubscription.updated_at)).limit(1))).scalar_one_or_none()
    if recurring is not None and recurring.provider=="paypal":
        await cancel_paypal_subscription(recurring.provider_subscription_id)
        recurring.cancel_at_period_end=True;recurring.updated_at=datetime.now(timezone.utc);await db.commit()
        return CancelSubscriptionResponse(status=recurring.status,cancel_at_period_end=True,current_period_end=None,message="PayPal recurring billing cancellation requested. Existing paid access remains valid through its paid-through date.")
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
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.SUBSCRIPTION_NOT_PENDING_CANCELLATION,
            "Subscription is not pending cancellation",
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
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.ALREADY_ON_PLAN,
            f"Already on the {data.new_plan} plan",
        )

    new_price_id = get_price_id(data.new_plan)
    await change_subscription_plan(record.stripe_subscription_id, new_price_id)
    return ChangePlanResponse(
        status=record.status,
        new_plan=data.new_plan,
        message=(
            f"Plan change to {data.new_plan} is scheduled for the end of the "
            "current paid period. No proration will be applied."
        ),
    )


# -- billing portal --------------------------------------------------------


@router.post("/billing-portal", response_model=BillingPortalResponse)
async def billing_portal(
    current_user: User = Depends(get_current_user),
) -> BillingPortalResponse:
    """Create a Stripe Customer Portal session for managing payment methods."""
    if not current_user.stripe_customer_id:
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.NO_BILLING_ACCOUNT,
            "No billing account found. Please set up a subscription first.",
        )
    portal_url = await create_billing_portal_session(
        stripe_customer_id=current_user.stripe_customer_id,
        return_url=f"https://{settings.stripe_redirect_allowed_domains[0]}",
    )
    return BillingPortalResponse(portal_url=portal_url)
