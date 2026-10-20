"""Provider-aware subscription status contract tests. No external provider calls."""
from datetime import datetime, timedelta, timezone
import uuid
import pytest
from app.api.routers.subscription import get_status
from app.db.models import AccessEntitlement, RecurringSubscription

def entitlement(user, provider):
    now=datetime.now(timezone.utc)
    return AccessEntitlement(id=uuid.uuid4(),user_id=user.id,plan_code="monthly",
        status="ACTIVE",starts_at=now-timedelta(days=1),
        expires_at=now+timedelta(days=20),source_provider=provider,
        source_payment_id="test-"+str(uuid.uuid4()),source_transaction_id=None,
        created_at=now,updated_at=now,metadata_payload={})

def recurring(user, subscription_id="I-TEST", status="ACTIVE", cancel=False):
    now=datetime.now(timezone.utc)
    return RecurringSubscription(id=uuid.uuid4(),user_id=user.id,provider="paypal",
        provider_subscription_id=subscription_id,provider_plan_id="P-MONTH",
        plan_code="monthly",status=status,next_billing_at=None,
        cancel_at_period_end=cancel,created_at=now,updated_at=now,metadata_payload={})

@pytest.mark.asyncio
@pytest.mark.parametrize("provider",["btcpay","monero","development_admin"])
async def test_entitlement_provider_status(db_session,test_user,provider):
    db_session.add(entitlement(test_user,provider))
    await db_session.commit()
    result=await get_status(current_user=test_user,db=db_session)
    assert result.is_active is True
    assert result.plan=="monthly"
    assert result.billing_provider==provider
    assert result.provider_subscription_id is None

@pytest.mark.asyncio
async def test_active_paypal_agreement_reports_revision_id(db_session,test_user):
    db_session.add(entitlement(test_user,"btcpay"))
    db_session.add(recurring(test_user))
    await db_session.commit()
    result=await get_status(current_user=test_user,db=db_session)
    assert result.billing_provider=="paypal"
    assert result.provider_subscription_id=="I-TEST"

@pytest.mark.asyncio
async def test_ambiguous_paypal_agreements_fail_closed(db_session,test_user):
    db_session.add(entitlement(test_user,"btcpay"))
    db_session.add(recurring(test_user,"I-ONE"))
    db_session.add(recurring(test_user,"I-TWO"))
    await db_session.commit()
    result=await get_status(current_user=test_user,db=db_session)
    assert result.provider_subscription_id is None

@pytest.mark.asyncio
async def test_cancel_pending_paypal_not_revisable(db_session,test_user):
    db_session.add(entitlement(test_user,"monero"))
    db_session.add(recurring(test_user,cancel=True))
    await db_session.commit()
    result=await get_status(current_user=test_user,db=db_session)
    assert result.billing_provider=="monero"
    assert result.provider_subscription_id is None


@pytest.mark.asyncio
async def test_administrative_access_never_inherits_paypal_revision_identity(db_session,test_user):
    """An administrative grant must not be presented as a paid PayPal agreement."""
    db_session.add(entitlement(test_user,"development_admin"))
    db_session.add(recurring(test_user,"I-HISTORICAL"))
    await db_session.commit()
    result=await get_status(current_user=test_user,db=db_session)
    assert result.billing_provider=="development_admin"
    assert result.provider_subscription_id is None
