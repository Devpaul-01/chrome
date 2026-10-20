"""PayPal settlement rejection contracts; no provider network requests."""
from datetime import datetime, timezone
from uuid import uuid4
import pytest
from sqlalchemy import select
from app.db.models import PaymentTransaction, AccessEntitlement, RecurringSubscription
from app.services.paypal_recurring_settlement import settle_paypal_subscription_sale

def agreement(user):
    now=datetime.now(timezone.utc)
    return RecurringSubscription(
        id=uuid4(),user_id=user.id,provider="paypal",
        provider_subscription_id="I-V664",provider_plan_id="P-MONTH",
        plan_code="monthly",status="ACTIVE",next_billing_at=None,
        cancel_at_period_end=False,created_at=now,updated_at=now,
        metadata_payload={}
    )

async def assert_no_new_financial_rows(db,user):
    transactions=(await db.execute(select(PaymentTransaction).where(PaymentTransaction.user_id==user.id))).scalars().all()
    entitlements=(await db.execute(select(AccessEntitlement).where(AccessEntitlement.user_id==user.id))).scalars().all()
    assert len(transactions)==0
    assert len(entitlements)==0

@pytest.mark.asyncio
@pytest.mark.parametrize("sale,snapshot,reason",[
    ({}, {"id":"I-V664","status":"ACTIVE","plan_id":"P-MONTH"}, "missing_sale_id"),
    ({"id":"S-V664","state":"PENDING"}, {"id":"I-V664","status":"ACTIVE","plan_id":"P-MONTH"}, "sale_not_completed"),
    ({"id":"S-V664","state":"COMPLETED"}, {"id":"I-OTHER","status":"ACTIVE","plan_id":"P-MONTH"}, "subscription_identity_mismatch"),
    ({"id":"S-V664","state":"COMPLETED"}, {"id":"I-V664","status":"SUSPENDED","plan_id":"P-MONTH"}, "subscription_not_active"),
])
async def test_rejected_sale_does_not_grant_access(db_session,test_user,sale,snapshot,reason):
    sub=agreement(test_user)
    db_session.add(sub)
    await db_session.commit()
    result=await settle_paypal_subscription_sale(
        db=db_session,sale=sale,subscription=sub,
        subscription_snapshot=snapshot,source="v664_mock_test"
    )
    assert result["settled"] is False
    assert result["reason"]==reason
    await assert_no_new_financial_rows(db_session,test_user)
