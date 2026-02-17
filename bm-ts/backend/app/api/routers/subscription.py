from __future__ import annotations

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import SubscriptionRecord, User
from app.db.session import get_db
from app.schemas.subscription import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    SubscriptionStatusResponse,
)
from app.services.stripe import create_checkout_session

router = APIRouter()


def _infer_plan(price_id: str | None) -> str | None:
    mapping = {
        settings.stripe_price_monthly: "monthly",
        settings.stripe_price_yearly: "yearly",
    }
    if price_id is None:
        return None
    return mapping.get(price_id)


@router.get("/status", response_model=SubscriptionStatusResponse)
async def status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionStatusResponse:
    stmt = (
        select(SubscriptionRecord)
        .where(SubscriptionRecord.user_id == current_user.id)
        .order_by(desc(SubscriptionRecord.updated_at))
        .limit(1)
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()
    if not record:
        return SubscriptionStatusResponse(is_active=False, plan=None, current_period_end=None, stripe_customer_id=None, stripe_subscription_id=None)

    return SubscriptionStatusResponse(
        is_active=record.status == "ACTIVE",
        plan=_infer_plan(record.price_id),
        current_period_end=record.current_period_end,
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
