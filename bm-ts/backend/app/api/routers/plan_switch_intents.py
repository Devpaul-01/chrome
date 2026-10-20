from __future__ import annotations
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.db.models import User, AccessEntitlement, PlanSwitchIntent, RecurringSubscription
from app.db.session import get_db

router = APIRouter()
class PlanSwitchIntentRequest(BaseModel):
    target_plan: str

@router.post("/intents", status_code=202)
async def create_plan_switch_intent(payload: PlanSwitchIntentRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    "Durable intent only. Never charges or changes entitlements."
    if payload.target_plan not in ("monthly", "yearly"):
        raise HTTPException(400, "Unsupported plan")
    if not idempotency_key or not 16 <= len(idempotency_key) <= 128 or not all(c.isalnum() or c in "._:-" for c in idempotency_key):
        raise HTTPException(400, "Valid Idempotency-Key required")
    # Serialize intent creation for this account; UNIQUE indexes remain final guards.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    existing = (await db.execute(select(PlanSwitchIntent).where(PlanSwitchIntent.user_id == user.id, PlanSwitchIntent.idempotency_key == idempotency_key))).scalar_one_or_none()
    if existing:
        if existing.target_plan != payload.target_plan: raise HTTPException(409, "Idempotency conflict")
        return {"intent_id": str(existing.id), "status": existing.status, "payment_started": bool((existing.metadata_payload or {}).get("payment_started", False))}
    open_intent = (await db.execute(select(PlanSwitchIntent).where(PlanSwitchIntent.user_id == user.id, PlanSwitchIntent.status.in_(("PENDING", "REQUIRES_APPROVAL", "AWAITING_SETTLEMENT"))))).scalar_one_or_none()
    if open_intent is not None: raise HTTPException(409, "A plan change is already pending")
    now = datetime.now(timezone.utc)
    current = (await db.execute(select(AccessEntitlement).where(AccessEntitlement.user_id == user.id, AccessEntitlement.status == "ACTIVE", AccessEntitlement.starts_at <= now, AccessEntitlement.expires_at > now).order_by(AccessEntitlement.expires_at.desc()).limit(1))).scalar_one_or_none()
    if not current: raise HTTPException(409, "No active paid entitlement")
    if current.source_provider == "development_admin": raise HTTPException(409, "Administrative access is not eligible for paid plan switching")
    if current.plan_code == payload.target_plan: raise HTTPException(409, "Already on requested plan")
    # A future prepaid entitlement may already contain the target plan; do not
    # silently create a conflicting switch before that coverage is reconciled.
    future = (await db.execute(select(AccessEntitlement.id).where(
        AccessEntitlement.user_id == user.id,
        AccessEntitlement.status == "ACTIVE",
        AccessEntitlement.starts_at >= current.expires_at,
    ).limit(1))).scalar_one_or_none()
    if future is not None: raise HTTPException(409, "Existing future paid coverage requires reconciliation")
    # Resolve the billing agreement independently of the entitlement source.
    # A previous one-time payment must not be mistaken for a current recurring agreement.
    recurring = (await db.execute(select(RecurringSubscription).where(
        RecurringSubscription.user_id == user.id,
        RecurringSubscription.provider == "paypal",
        RecurringSubscription.status == "ACTIVE",
        RecurringSubscription.cancel_at_period_end.is_(False),
    ).order_by(RecurringSubscription.updated_at.desc()).limit(2))).scalars().all()
    if len(recurring) > 1:
        raise HTTPException(409, "Multiple active billing agreements require reconciliation")
    provider_subscription_id = None
    if recurring:
        if not recurring[0].provider_subscription_id:
            raise HTTPException(409, "Recurring agreement identity missing")
        provider = "paypal"
        provider_subscription_id = recurring[0].provider_subscription_id
    else:
        provider = current.source_provider
        if provider == "paypal":
            # A PayPal one-time entitlement is not an automatic billing mandate.
            raise HTTPException(409, "PayPal billing agreement must be verified before switching")
    if provider not in ("btcpay", "monero", "paypal"):
        raise HTTPException(409, "Unsupported provider")
    row = PlanSwitchIntent(id=uuid4(), user_id=user.id, idempotency_key=idempotency_key, from_plan=current.plan_code, target_plan=payload.target_plan, provider=provider, status="PENDING", metadata_payload={"payment_started": False, "requires_provider_confirmation": True, "provider_subscription_id": provider_subscription_id})
    db.add(row)
    try: await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Existing or concurrent plan change")
    return {"intent_id": str(row.id), "status": "PENDING", "payment_started": False}

@router.get("/intents/{intent_id}")
async def get_plan_switch_intent(intent_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from uuid import UUID
    try: parsed_id = UUID(intent_id)
    except ValueError: raise HTTPException(404, "Plan change not found")
    row = (await db.execute(select(PlanSwitchIntent).where(PlanSwitchIntent.id == parsed_id, PlanSwitchIntent.user_id == user.id))).scalar_one_or_none()
    if row is None: raise HTTPException(404, "Plan change not found")
    return {"intent_id": str(row.id), "status": row.status, "from_plan": row.from_plan, "target_plan": row.target_plan, "payment_started": bool((row.metadata_payload or {}).get("payment_started", False))}


@router.post("/intents/{intent_id}/cancel")
async def cancel_unstarted_plan_switch_intent(
    intent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Release an unstarted intent; never cancel a provider-side payment.

    This operation is deliberately unavailable after any provider attempt may
    have started. Such requests require provider reconciliation instead.
    """
    from uuid import UUID
    try:
        parsed_id = UUID(intent_id)
    except (ValueError, TypeError):
        raise HTTPException(404, "Plan change not found")

    # Lock the user before the intent to serialize against create requests.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    row = (await db.execute(select(PlanSwitchIntent).where(
        PlanSwitchIntent.id == parsed_id,
        PlanSwitchIntent.user_id == user.id,
    ).with_for_update())).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Plan change not found")
    if row.status == "CANCELED":
        return {"intent_id": str(row.id), "status": "CANCELED"}
    if row.status != "PENDING":
        raise HTTPException(409, "Plan change requires reconciliation")
    metadata = row.metadata_payload or {}
    if metadata.get("payment_started") or row.provider_reference or not metadata.get("requires_provider_confirmation", False):
        raise HTTPException(409, "Provider status requires reconciliation")
    row.status = "CANCELED"
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"intent_id": str(row.id), "status": "CANCELED"}


@router.get("/intents/{intent_id}/paypal/confirmation")
async def read_paypal_plan_revision_confirmation(
    intent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Read-only PayPal confirmation; never activate a plan from an approval redirect."""
    from uuid import UUID
    from app.services.paypal import confirm_revised_subscription
    try:
        parsed_id = UUID(intent_id)
    except (ValueError, TypeError):
        raise HTTPException(404, "Plan change not found")
    row = (await db.execute(select(PlanSwitchIntent).where(
        PlanSwitchIntent.id == parsed_id,
        PlanSwitchIntent.user_id == user.id,
    ))).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Plan change not found")
    if row.provider != "paypal":
        raise HTTPException(409, "Not a PayPal plan change")
    subscription_id = (row.metadata_payload or {}).get("provider_subscription_id")
    if not isinstance(subscription_id, str) or not subscription_id:
        raise HTTPException(409, "PayPal agreement identity missing")
    if row.status not in ("PENDING", "REQUIRES_APPROVAL", "AWAITING_SETTLEMENT"):
        raise HTTPException(409, "Plan change is not awaiting approval")
    confirmation = await confirm_revised_subscription(
        subscription_id=subscription_id, target_plan=row.target_plan,
    )
    # Provider confirmation establishes revision approval, NOT settlement.
    # Persist that fact only after rechecking the intent under a row lock.
    confirmed = bool(confirmation.get("confirmed", False))
    if confirmed:
        locked = (await db.execute(select(PlanSwitchIntent).where(
            PlanSwitchIntent.id == parsed_id,
            PlanSwitchIntent.user_id == user.id,
        ).with_for_update())).scalar_one_or_none()
        if locked is None or locked.provider != "paypal" or locked.status not in ("PENDING", "REQUIRES_APPROVAL", "AWAITING_SETTLEMENT"):
            raise HTTPException(409, "Plan change requires reconciliation")
        saved = dict(locked.metadata_payload or {})
        if saved.get("provider_subscription_id") != subscription_id or locked.target_plan != row.target_plan:
            raise HTTPException(409, "Plan change identity changed")
        saved["provider_revision_confirmed"] = True
        locked.metadata_payload = saved
        locked.status = "AWAITING_SETTLEMENT"
        locked.updated_at = datetime.now(timezone.utc)
        await db.commit()
    # No RecurringSubscription or entitlement mutation here. A separately
    # verified provider billing event must complete the transition.
    return {
        "intent_id": str(row.id),
        "provider_confirmed": confirmed,
        "reason": str(confirmation.get("reason", "unknown")),
        "billing_settled": False,
        "plan_activated": False,
    }



@router.post("/intents/{intent_id}/paypal/revise", status_code=202)
async def initiate_paypal_plan_revision(
    intent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Initiate once, then require customer approval and independent reconciliation.

    A timeout after sending the provider request is ambiguous: never send another
    revision automatically. Reconcile the original agreement before retrying.
    """
    from uuid import UUID
    from app.services.paypal import revise_recurring_subscription, revision_approval_url
    try:
        parsed_id = UUID(intent_id)
    except (ValueError, TypeError):
        raise HTTPException(404, "Plan change not found")
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    row = (await db.execute(select(PlanSwitchIntent).where(
        PlanSwitchIntent.id == parsed_id, PlanSwitchIntent.user_id == user.id,
    ).with_for_update())).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Plan change not found")
    if row.provider != "paypal" or row.status not in ("PENDING", "REQUIRES_APPROVAL"):
        raise HTTPException(409, "PayPal revision is not available for this intent")
    metadata = dict(row.metadata_payload or {})
    subscription_id = metadata.get("provider_subscription_id")
    if not isinstance(subscription_id, str) or not subscription_id:
        raise HTTPException(409, "PayPal agreement identity missing")
    recurring = (await db.execute(select(RecurringSubscription).where(
        RecurringSubscription.user_id == user.id,
        RecurringSubscription.provider == "paypal",
        RecurringSubscription.provider_subscription_id == subscription_id,
        RecurringSubscription.status == "ACTIVE",
        RecurringSubscription.cancel_at_period_end.is_(False),
    ).with_for_update())).scalar_one_or_none()
    if recurring is None:
        raise HTTPException(409, "Active PayPal agreement not found")
    if metadata.get("payment_started"):
        return {"intent_id": str(row.id), "status": row.status,
                "approval_url": metadata.get("approval_url"),
                "requires_reconciliation": True, "revision_resubmitted": False}
    # Persist the in-flight marker BEFORE calling PayPal. A provider timeout is
    # ambiguous and must never trigger an automatic duplicate revision.
    metadata["payment_started"] = True
    metadata["requires_provider_confirmation"] = True
    row.metadata_payload = metadata
    row.status = "REQUIRES_APPROVAL"
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    try:
        response = await revise_recurring_subscription(
            subscription_id=subscription_id,
            target_plan=row.target_plan,
            idempotency_key=str(row.id),
        )
    except Exception:
        # Do not reset payment_started: the provider may have accepted the call.
        raise HTTPException(503, "PayPal revision outcome uncertain; reconcile before retrying")
    approval = revision_approval_url(response)
    # Save approval link for an authenticated retry, without marking the plan
    # complete or changing the existing recurring agreement.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    locked = (await db.execute(select(PlanSwitchIntent).where(
        PlanSwitchIntent.id == parsed_id, PlanSwitchIntent.user_id == user.id,
    ).with_for_update())).scalar_one_or_none()
    if locked is None or locked.status != "REQUIRES_APPROVAL":
        raise HTTPException(409, "Intent requires reconciliation")
    saved = dict(locked.metadata_payload or {})
    if approval:
        saved["approval_url"] = approval
    locked.metadata_payload = saved
    locked.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"intent_id": str(locked.id), "status": locked.status,
            "approval_url": approval, "requires_reconciliation": True,
            "revision_resubmitted": False}
