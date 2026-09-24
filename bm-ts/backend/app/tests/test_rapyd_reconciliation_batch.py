from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest

from app.db.models import PaymentCheckoutAttempt, PaymentTransaction
from app.services import rapyd
from app.services import rapyd_reconciliation as reconciliation


async def _row(db, user, *, age=300):
    now = datetime.now(timezone.utc)
    old = now - timedelta(seconds=age)
    aid = uuid4()
    attempt = PaymentCheckoutAttempt(
        id=aid,
        user_id=user.id,
        provider="rapyd",
        idempotency_key=f"rapyd:{aid}",
        plan_code="monthly",
        amount=Decimal("9.70"),
        currency="USD",
        metadata_payload={},
        provider_order_id=f"BM-RAPYD-{aid}",
        provider_payment_id=f"checkout_{uuid4().hex}",
        status="completed",
        created_at=old,
        updated_at=old,
    )
    tx = PaymentTransaction(
        id=uuid4(),
        user_id=user.id,
        checkout_attempt_id=aid,
        provider="rapyd",
        provider_payment_id=None,
        provider_order_id=attempt.provider_order_id,
        amount=Decimal("9.70"),
        currency="USD",
        status="NEW",
        checkout_url="https://checkout.example.test",
        payment_method="rapyd_hosted_checkout",
        plan_code="monthly",
        paid_at=None,
        expires_at=None,
        created_at=old,
        updated_at=old,
        metadata_payload={"billing_term_months": 1},
    )
    db.add_all([attempt, tx])
    await db.commit()
    return tx


@pytest.mark.asyncio
async def test_batch_is_bounded_and_only_selects_stale_rows(db_session, test_user, monkeypatch):
    stale1 = await _row(db_session, test_user, age=500)
    stale2 = await _row(db_session, test_user, age=400)
    await _row(db_session, test_user, age=5)
    calls = []

    async def fake(*, db, transaction_id):
        calls.append(transaction_id)
        return {"reconciled": False, "reason": "financial_truth_not_final"}

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake)
    result = await reconciliation.reconcile_stale_rapyd_transactions(
        db=db_session, limit=1, stale_seconds=120
    )
    assert result["scanned"] == 1
    assert result["unresolved"] == 1
    assert len(calls) == 1
    assert calls[0] in {stale1.id, stale2.id}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "exc",
    [
        rapyd.RapydTransportError("network"),
        rapyd.RapydRateLimitError(retry_after=7),
        rapyd.RapydResponseError("malformed"),
        reconciliation.RapydReconciliationError("provider truth incomplete"),
    ],
)
async def test_retryable_provider_failures_are_classified_without_settlement(
    db_session, test_user, monkeypatch, exc
):
    await _row(db_session, test_user)

    async def fake(**_kwargs):
        raise exc

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake)
    result = await reconciliation.reconcile_stale_rapyd_transactions(db=db_session)
    assert result["scanned"] == 1
    assert result["retryable"] == 1
    assert result["settled"] == 0


@pytest.mark.asyncio
async def test_provider_4xx_is_terminal_for_batch_attempt(db_session, test_user, monkeypatch):
    await _row(db_session, test_user)

    async def fake(**_kwargs):
        raise rapyd.RapydProviderError(status_code=400, provider_code="BAD_REQUEST")

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake)
    result = await reconciliation.reconcile_stale_rapyd_transactions(db=db_session)
    assert result["terminal"] == 1
    assert result["settled"] == 0


@pytest.mark.asyncio
async def test_verified_partial_or_unpaid_truth_remains_unresolved(db_session, test_user, monkeypatch):
    await _row(db_session, test_user)

    async def fake(**_kwargs):
        return {"reconciled": False, "reason": "financial_truth_not_final"}

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake)
    result = await reconciliation.reconcile_stale_rapyd_transactions(db=db_session)
    assert result["unresolved"] == 1
    assert result["settled"] == 0


@pytest.mark.asyncio
async def test_success_is_counted_once(db_session, test_user, monkeypatch):
    await _row(db_session, test_user)

    async def fake(**_kwargs):
        return {"reconciled": True, "reason": "settled"}

    monkeypatch.setattr(reconciliation, "reconcile_rapyd_transaction", fake)
    result = await reconciliation.reconcile_stale_rapyd_transactions(db=db_session)
    assert result["settled"] == 1
    assert result["failed"] == 0
