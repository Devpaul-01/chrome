from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from app.api.routers import payments
from app.db.models import PaymentCheckoutAttempt
from app.services import rapyd

def test_rapyd_checkout_route_registered():
    assert "/rapyd/checkout" in {r.path for r in payments.router.routes}

@pytest.mark.asyncio
async def test_hosted_checkout_forwards_stable_idempotency(monkeypatch):
    captured = {}
    async def fake_request(**kwargs):
        captured.update(kwargs)
        return {"id": "checkout_123", "redirect_url": "https://checkout.example.test"}
    monkeypatch.setattr(rapyd, "request", fake_request)
    result = await rapyd.create_hosted_checkout(
        amount=Decimal("9.70"), currency="usd",
        merchant_reference_id="BM-RAPYD-order-1",
        idempotency_key="stable-idempotency-key-123", description="Monthly",
    )
    assert result["id"] == "checkout_123"
    assert captured["path"] == "/v1/checkout"
    assert captured["idempotency_key"] == "stable-idempotency-key-123"
    assert captured["payload"]["currency"] == "USD"

@pytest.mark.asyncio
async def test_finalize_is_idempotent(db_session, test_user):
    attempt = PaymentCheckoutAttempt(
        id=uuid4(), user_id=test_user.id, provider="rapyd",
        idempotency_key="finalize-rapyd-key-12345", plan_code="monthly",
        amount=Decimal("9.70"), currency="USD",
        provider_order_id=f"BM-RAPYD-{uuid4()}", provider_payment_id=None,
        checkout_url=None, status="claimed", failure_code=None,
        claim_expires_at=None, completed_at=None,
        created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc),
        metadata_payload={"billing_term_months": 1},
    )
    db_session.add(attempt)
    await db_session.commit()
    checkout = {"id": "checkout_abc", "redirect_url": "https://checkout.example.test/abc", "status": "NEW"}
    one = await payments._finalize_rapyd_checkout(
        db=db_session, attempt=attempt, checkout=checkout, term_months=1
    )
    two = await payments._finalize_rapyd_checkout(
        db=db_session, attempt=attempt, checkout=checkout, term_months=1
    )
    assert one.id == two.id
    assert one.provider == "rapyd"
    assert attempt.status == "completed"
