"""Tests for the BTCPay payment webhook endpoint.

Covers signature validation, lifecycle mapping, settlement semantics,
unknown invoices, and logical-event idempotency via originalDeliveryId.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import PaymentTransaction, PaymentWebhookEvent, User


_WEBHOOK_PATH = "/api/payments/btcpay/webhook"
_TEST_SECRET = "btcpay-test-webhook-secret"


def _signed_payload(payload: dict) -> tuple[bytes, str]:
    """Serialize exactly once and sign the exact bytes sent to FastAPI."""
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signature = "sha256=" + hmac.new(
        _TEST_SECRET.encode("utf-8"), raw, hashlib.sha256
    ).hexdigest()
    return raw, signature


async def _post_event(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    payload: dict,
):
    monkeypatch.setattr(settings, "btcpay_webhook_secret", _TEST_SECRET)
    raw, signature = _signed_payload(payload)
    return await client.post(
        _WEBHOOK_PATH,
        content=raw,
        headers={
            "Content-Type": "application/json",
            "BTCPAY-SIG": signature,
        },
    )


async def _create_payment(
    db: AsyncSession,
    user: User,
    *,
    invoice_id: str | None = None,
    status: str = "New",
    paid_at: datetime | None = None,
) -> PaymentTransaction:
    now = datetime.now(timezone.utc)
    transaction = PaymentTransaction(
        id=uuid.uuid4(),
        user_id=user.id,
        provider="btcpay",
        provider_payment_id=invoice_id or f"invoice-{uuid.uuid4().hex}",
        provider_order_id=f"order-{uuid.uuid4().hex}",
        amount=Decimal("1.00"),
        currency="USD",
        status=status,
        checkout_url="https://example.test/checkout",
        payment_method="bitcoin",
        plan_code="btcpay-integration-test",
        paid_at=paid_at,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"phase": "test"},
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    return transaction


def _event(
    *,
    event_type: str,
    invoice_id: str,
    delivery_id: str | None = None,
    original_delivery_id: str | None = None,
    is_redelivery: bool = False,
    **extra,
) -> dict:
    delivery_id = delivery_id or f"delivery-{uuid.uuid4().hex}"
    original_delivery_id = original_delivery_id or delivery_id
    payload = {
        "deliveryId": delivery_id,
        "originalDeliveryId": original_delivery_id,
        "isRedelivery": is_redelivery,
        "type": event_type,
        "invoiceId": invoice_id,
    }
    payload.update(extra)
    return payload


@pytest.mark.asyncio
async def test_invalid_signature_is_rejected_without_event_record(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "btcpay_webhook_secret", _TEST_SECRET)
    payload = _event(event_type="InvoiceCreated", invoice_id="unknown-invoice")

    resp = await async_client.post(
        _WEBHOOK_PATH,
        content=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "BTCPAY-SIG": "sha256=wrong"},
    )

    assert resp.status_code == 401
    count = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    assert count == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "expected_status"),
    [
        ("InvoiceCreated", "New"),
        ("InvoiceProcessing", "Processing"),
        ("InvoiceExpired", "Expired"),
        ("InvoiceInvalid", "Invalid"),
    ],
)
async def test_non_settlement_lifecycle_events_do_not_set_paid_at(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    event_type: str,
    expected_status: str,
):
    transaction = await _create_payment(db_session, test_user)

    resp = await _post_event(
        async_client,
        monkeypatch,
        _event(event_type=event_type, invoice_id=transaction.provider_payment_id or ""),
    )

    assert resp.status_code == 200
    assert resp.json()["processed"] is True
    await db_session.refresh(transaction)
    assert transaction.status == expected_status
    assert transaction.paid_at is None


@pytest.mark.asyncio
async def test_invoice_settled_sets_paid_at_and_records_provider_status_detail(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    transaction = await _create_payment(db_session, test_user)

    resp = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type="InvoiceSettled",
            invoice_id=transaction.provider_payment_id or "",
            status="Settled",
            additionalStatus="None",
        ),
    )

    assert resp.status_code == 200
    await db_session.refresh(transaction)
    assert transaction.status == "Settled"
    assert transaction.paid_at is not None
    assert transaction.metadata_payload["btcpay_event_status"] == "Settled"
    assert transaction.metadata_payload["btcpay_additional_status"] == "None"


@pytest.mark.asyncio
async def test_unknown_invoice_is_recorded_as_ignored(
    async_client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    payload = _event(event_type="InvoiceExpired", invoice_id="not-a-birthdaymessaging-invoice")

    resp = await _post_event(async_client, monkeypatch, payload)

    assert resp.status_code == 200
    assert resp.json() == {
        "received": True,
        "processed": False,
        "reason": "invoice_not_found",
    }
    result = await db_session.execute(select(PaymentWebhookEvent))
    event = result.scalar_one()
    assert event.processing_status == "ignored"
    assert event.processing_error == "invoice_not_found"


@pytest.mark.asyncio
async def test_same_logical_event_redelivery_is_processed_once(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    transaction = await _create_payment(db_session, test_user)
    logical_id = f"logical-{uuid.uuid4().hex}"

    first = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type="InvoiceExpired",
            invoice_id=transaction.provider_payment_id or "",
            delivery_id=f"delivery-{uuid.uuid4().hex}",
            original_delivery_id=logical_id,
            is_redelivery=False,
        ),
    )
    assert first.status_code == 200
    assert first.json()["processed"] is True

    await db_session.refresh(transaction)
    first_updated_at = transaction.updated_at

    second = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type="InvoiceExpired",
            invoice_id=transaction.provider_payment_id or "",
            delivery_id=f"delivery-{uuid.uuid4().hex}",
            original_delivery_id=logical_id,
            is_redelivery=True,
        ),
    )

    assert second.status_code == 200
    assert second.json() == {
        "received": True,
        "processed": False,
        "reason": "duplicate_event",
    }

    count = await db_session.scalar(
        select(func.count())
        .select_from(PaymentWebhookEvent)
        .where(
            PaymentWebhookEvent.provider == "btcpay",
            PaymentWebhookEvent.provider_event_id == logical_id,
        )
    )
    assert count == 1

    await db_session.refresh(transaction)
    assert transaction.updated_at == first_updated_at

# ---------------------------------------------------------------------------
# Full-payment-only and lifecycle-ordering safety tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "provider_status"),
    [
        ("InvoiceProcessing", "Processing"),
        ("InvoiceExpired", "Expired"),
    ],
)
async def test_partial_payment_never_establishes_paid_at(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    event_type: str,
    provider_status: str,
):
    """PaidPartial is recorded as provider detail but never counts as fulfillment."""
    transaction = await _create_payment(db_session, test_user)

    resp = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type=event_type,
            invoice_id=transaction.provider_payment_id or "",
            status=provider_status,
            additionalStatus="PaidPartial",
            partiallyPaid=True,
        ),
    )

    assert resp.status_code == 200
    await db_session.refresh(transaction)

    assert transaction.paid_at is None
    assert transaction.metadata_payload["btcpay_additional_status"] == "PaidPartial"


async def _settle_payment(
    client: AsyncClient,
    db: AsyncSession,
    user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> PaymentTransaction:
    transaction = await _create_payment(db, user)

    resp = await _post_event(
        client,
        monkeypatch,
        _event(
            event_type="InvoiceSettled",
            invoice_id=transaction.provider_payment_id or "",
            status="Settled",
            additionalStatus="None",
            partiallyPaid=False,
        ),
    )
    assert resp.status_code == 200

    await db.refresh(transaction)
    assert transaction.status == "Settled"
    assert transaction.paid_at is not None
    return transaction


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "later_event_type",
    [
        "InvoiceCreated",
        "InvoiceProcessing",
        "InvoiceExpired",
        "InvoiceInvalid",
    ],
)
async def test_settled_payment_cannot_be_downgraded_by_later_nonsettlement_event(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    later_event_type: str,
):
    """
    Once full settlement is authoritative, a delayed/reordered non-settlement
    event may be recorded in the event ledger but must not revoke payment truth.
    """
    transaction = await _settle_payment(
        async_client, db_session, test_user, monkeypatch
    )
    original_paid_at = transaction.paid_at

    resp = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type=later_event_type,
            invoice_id=transaction.provider_payment_id or "",
        ),
    )

    assert resp.status_code == 200
    await db_session.refresh(transaction)

    assert transaction.status == "Settled"
    assert transaction.paid_at == original_paid_at

    event_count = await db_session.scalar(
        select(func.count())
        .select_from(PaymentWebhookEvent)
        .where(
            PaymentWebhookEvent.provider == "btcpay",
            PaymentWebhookEvent.provider_payment_id == transaction.provider_payment_id,
        )
    )
    assert event_count == 2


@pytest.mark.asyncio
async def test_expired_invoice_can_later_become_fully_settled(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """A later authoritative full settlement must be able to establish payment."""
    transaction = await _create_payment(db_session, test_user)

    expired = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type="InvoiceExpired",
            invoice_id=transaction.provider_payment_id or "",
        ),
    )
    assert expired.status_code == 200

    await db_session.refresh(transaction)
    assert transaction.status == "Expired"
    assert transaction.paid_at is None

    settled = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type="InvoiceSettled",
            invoice_id=transaction.provider_payment_id or "",
            status="Settled",
            additionalStatus="PaidLate",
            partiallyPaid=False,
        ),
    )
    assert settled.status_code == 200

    await db_session.refresh(transaction)
    assert transaction.status == "Settled"
    assert transaction.paid_at is not None


@pytest.mark.asyncio
async def test_distinct_settled_events_do_not_change_original_paid_at(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """
    Even if BTCPay emits another distinct settlement event, paid_at represents
    the first authoritative settlement and must remain immutable.
    """
    transaction = await _settle_payment(
        async_client, db_session, test_user, monkeypatch
    )
    first_paid_at = transaction.paid_at

    resp = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type="InvoiceSettled",
            invoice_id=transaction.provider_payment_id or "",
            status="Settled",
            additionalStatus="None",
            partiallyPaid=False,
        ),
    )

    assert resp.status_code == 200
    await db_session.refresh(transaction)
    assert transaction.status == "Settled"
    assert transaction.paid_at == first_paid_at


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("partially_paid", "additional_status"),
    [
        (True, "None"),
        (False, "PaidPartial"),
        (True, "PaidPartial"),
    ],
)
async def test_contradictory_partial_invoice_settled_never_becomes_paid(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    partially_paid: bool,
    additional_status: str,
):
    """
    Defensive full-payment-only invariant.

    Even if an incoming webhook says InvoiceSettled, either explicit partial
    signal is sufficient to block local settlement and paid_at.
    """
    transaction = await _create_payment(db_session, test_user)

    resp = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type="InvoiceSettled",
            invoice_id=transaction.provider_payment_id or "",
            status="Settled",
            additionalStatus=additional_status,
            partiallyPaid=partially_paid,
        ),
    )

    assert resp.status_code == 200
    assert resp.json()["processed"] is True

    await db_session.refresh(transaction)
    assert transaction.status == "Processing"
    assert transaction.paid_at is None
    assert transaction.metadata_payload["btcpay_event_status"] == "Settled"
    assert (
        transaction.metadata_payload["btcpay_additional_status"]
        == additional_status
    )


@pytest.mark.asyncio
async def test_partial_settlement_signal_cannot_revoke_prior_full_settlement(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """
    Once genuine full settlement has happened, a later contradictory partial
    payload cannot revoke it or replace the original paid_at timestamp.
    """
    transaction = await _settle_payment(
        async_client, db_session, test_user, monkeypatch
    )
    original_paid_at = transaction.paid_at

    resp = await _post_event(
        async_client,
        monkeypatch,
        _event(
            event_type="InvoiceSettled",
            invoice_id=transaction.provider_payment_id or "",
            status="Settled",
            additionalStatus="PaidPartial",
            partiallyPaid=True,
        ),
    )

    assert resp.status_code == 200
    await db_session.refresh(transaction)

    assert transaction.status == "Settled"
    assert transaction.paid_at == original_paid_at

