"""Behavioral administrative billing guard regression; no external provider calls."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from app.api.routers.plan_switch_intents import create_plan_switch_intent, PlanSwitchIntentRequest
from app.db.models import AccessEntitlement, PlanSwitchIntent, RecurringSubscription

@pytest.mark.asyncio
async def test_admin_access_rejected_without_intent_or_payment(db_session, test_user):
    now = datetime.now(timezone.utc)
    db_session.add(AccessEntitlement(
        id=uuid4(), user_id=test_user.id, plan_code="monthly", status="ACTIVE",
        starts_at=now-timedelta(days=1), expires_at=now+timedelta(days=20),
        source_provider="development_admin", source_payment_id="v658-admin-test",
        source_transaction_id=None, created_at=now, updated_at=now, metadata_payload={}))
    await db_session.commit()
    with pytest.raises(HTTPException) as error:
        await create_plan_switch_intent(
            payload=PlanSwitchIntentRequest(target_plan="yearly"),
            idempotency_key="v658-admin-intent-0001", user=test_user, db=db_session)
    assert error.value.status_code == 409
    assert "Administrative access" in str(error.value.detail)
    count = (await db_session.execute(select(func.count()).select_from(PlanSwitchIntent).where(
        PlanSwitchIntent.user_id == test_user.id))).scalar_one()
    assert count == 0

@pytest.mark.asyncio
async def test_admin_access_with_historical_paypal_still_rejected(db_session, test_user):
    now = datetime.now(timezone.utc)
    db_session.add(AccessEntitlement(
        id=uuid4(), user_id=test_user.id, plan_code="monthly", status="ACTIVE",
        starts_at=now-timedelta(days=1), expires_at=now+timedelta(days=20),
        source_provider="development_admin", source_payment_id="v658-admin-with-paypal",
        source_transaction_id=None, created_at=now, updated_at=now, metadata_payload={}))
    db_session.add(RecurringSubscription(
        id=uuid4(), user_id=test_user.id, provider="paypal",
        provider_subscription_id="I-HISTORICAL", provider_plan_id="P-MONTH",
        plan_code="monthly", status="ACTIVE", next_billing_at=None,
        cancel_at_period_end=False, created_at=now, updated_at=now, metadata_payload={}))
    await db_session.commit()
    with pytest.raises(HTTPException) as error:
        await create_plan_switch_intent(
            payload=PlanSwitchIntentRequest(target_plan="yearly"),
            idempotency_key="v658-admin-paypal-0001", user=test_user, db=db_session)
    assert error.value.status_code == 409
    assert "Administrative access" in str(error.value.detail)
    count = (await db_session.execute(select(func.count()).select_from(PlanSwitchIntent).where(
        PlanSwitchIntent.user_id == test_user.id))).scalar_one()
    assert count == 0
