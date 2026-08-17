"""BirthdayMessaging payment endpoints.

Phase 2 intentionally exposes only a controlled BTCPay test-invoice endpoint.
Production plan pricing and subscription activation are added in later phases.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import PaymentTransaction, PaymentWebhookEvent, User
from app.db.session import get_db
from app.schemas.payment import BTCPayTestInvoiceResponse
from app.services.btcpay import create_invoice


router = APIRouter()

# Server-controlled development amount. The browser cannot choose the price.
_TEST_AMOUNT = Decimal("1.00")
_TEST_CURRENCY = "USD"
_TEST_PLAN_CODE = "btcpay-integration-test"


@router.post(
    "/btcpay/test-invoice",
    response_model=BTCPayTestInvoiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_btcpay_test_invoice(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BTCPayTestInvoiceResponse:
    """Create a $1 BTCPay invoice and record it in payment_transactions."""
    local_payment_id = uuid4()
    order_id = f"BM-TEST-{local_payment_id}"

    invoice = await create_invoice(
        amount=_TEST_AMOUNT,
        currency=_TEST_CURRENCY,
        order_id=order_id,
        description="BirthdayMessaging BTCPay integration test",
        user_id=str(current_user.id),
        buyer_email=str(current_user.email),
    )

    provider_payment_id = str(invoice["id"])
    checkout_url = str(invoice.get("checkoutLink") or "")
    provider_status = str(invoice.get("status") or "New")

    if not checkout_url:
        # Do not persist an unusable local payment record.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BTCPay invoice response did not include a checkout URL.",
        )

    now = datetime.now(timezone.utc)

    transaction = PaymentTransaction(
        id=local_payment_id,
        user_id=current_user.id,
        provider="btcpay",
        provider_payment_id=provider_payment_id,
        provider_order_id=order_id,
        amount=_TEST_AMOUNT,
        currency=_TEST_CURRENCY,
        status=provider_status,
        checkout_url=checkout_url,
        payment_method="bitcoin",
        plan_code=_TEST_PLAN_CODE,
        paid_at=None,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={
            "btcpay_invoice_id": provider_payment_id,
            "phase": "integration-test",
        },
    )

    db.add(transaction)

    try:
        await db.commit()
        await db.refresh(transaction)
    except Exception:
        await db.rollback()
        raise

    return BTCPayTestInvoiceResponse(
        payment_id=str(transaction.id),
        provider=transaction.provider,
        provider_payment_id=transaction.provider_payment_id or "",
        status=transaction.status,
        checkout_url=transaction.checkout_url or "",
        amount=transaction.amount,
        currency=transaction.currency,
        plan_code=transaction.plan_code or _TEST_PLAN_CODE,
    )

# BTCPay webhook events that directly represent the invoice lifecycle.
# Important: only InvoiceSettled is treated as a final successful payment.
_BTCPAY_EVENT_STATUS = {
    "InvoiceCreated": "New",
    "InvoiceProcessing": "Processing",
    "InvoiceExpired": "Expired",
    "InvoiceSettled": "Settled",
    "InvoiceInvalid": "Invalid",
}


def _verify_btcpay_signature(raw_body: bytes, signature: str) -> bool:
    """Validate BTCPay's BTCPAY-SIG HMAC-SHA256 signature."""
    secret = settings.btcpay_webhook_secret
    if not secret:
        return False

    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


@router.post("/btcpay/webhook", status_code=status.HTTP_200_OK)
async def btcpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool | str]:
    """
    Receive authenticated BTCPay Server webhook events.

    Security and idempotency rules:
    - This route intentionally does NOT use end-user JWT authentication.
      BTCPay Server calls it directly.
    - Authenticity is established with BTCPAY-SIG over the exact raw body.
    - The frontend never decides whether a payment is settled.
    - BTCPay originalDeliveryId is the logical event idempotency key.
    """
    if not settings.btcpay_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BTCPay webhook is not configured.",
        )

    raw_body = await request.body()
    signature = request.headers.get("BTCPAY-SIG", "")

    if not signature or not _verify_btcpay_signature(raw_body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid BTCPay webhook signature.",
        )

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid BTCPay webhook payload.",
        )

    if not isinstance(event, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid BTCPay webhook payload.",
        )

    event_type = str(event.get("type") or "")
    invoice_id = str(event.get("invoiceId") or "")
    delivery_id = str(event.get("deliveryId") or "")
    original_delivery_id = str(event.get("originalDeliveryId") or delivery_id)
    is_redelivery = bool(event.get("isRedelivery", False))

    # Store-level events that do not identify a logical delivery are acknowledged
    # without entering the payment-event ledger.
    if not original_delivery_id:
        return {
            "received": True,
            "processed": False,
            "reason": "missing_event_id",
        }

    # Claim the logical event first. The database UNIQUE(provider,
    # provider_event_id) constraint is the concurrency-safe idempotency guard.
    webhook_event = PaymentWebhookEvent(
        provider="btcpay",
        provider_event_id=original_delivery_id,
        provider_delivery_id=delivery_id or None,
        provider_payment_id=invoice_id or None,
        event_type=event_type or "unknown",
        is_redelivery=is_redelivery,
        processing_status="received",
        payload=event,
    )
    db.add(webhook_event)

    try:
        await db.commit()
        await db.refresh(webhook_event)
    except IntegrityError:
        await db.rollback()

        existing_result = await db.execute(
            select(PaymentWebhookEvent).where(
                PaymentWebhookEvent.provider == "btcpay",
                PaymentWebhookEvent.provider_event_id == original_delivery_id,
            )
        )
        existing_event = existing_result.scalar_one_or_none()

        if existing_event is None:
            raise

        # A successfully handled or intentionally ignored event must never
        # execute business side effects again. Failed events are retriable.
        if existing_event.processing_status in {"processed", "ignored"}:
            return {
                "received": True,
                "processed": False,
                "reason": "duplicate_event",
            }

        if existing_event.processing_status == "received":
            # Another request may currently own this event. Acknowledge this
            # concurrent duplicate rather than processing it twice.
            return {
                "received": True,
                "processed": False,
                "reason": "duplicate_in_progress",
            }

        # A prior attempt failed. Reuse the same logical event row and retry.
        webhook_event = existing_event
        webhook_event.provider_delivery_id = delivery_id or webhook_event.provider_delivery_id
        webhook_event.provider_payment_id = invoice_id or webhook_event.provider_payment_id
        webhook_event.event_type = event_type or webhook_event.event_type
        webhook_event.is_redelivery = is_redelivery
        webhook_event.payload = event
        webhook_event.processing_status = "received"
        webhook_event.processed_at = None
        webhook_event.processing_error = None
        await db.commit()

    # BTCPay may send other store-level events if the webhook is configured
    # broadly. Persist and acknowledge events unrelated to an invoice.
    if not invoice_id:
        webhook_event.processing_status = "ignored"
        webhook_event.processed_at = datetime.now(timezone.utc)
        webhook_event.processing_error = None
        await db.commit()
        return {
            "received": True,
            "processed": False,
            "reason": "no_invoice_id",
        }

    try:
        result = await db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.provider == "btcpay",
                PaymentTransaction.provider_payment_id == invoice_id,
            )
        )
        transaction = result.scalar_one_or_none()

        # The same BTCPay store may contain invoices that were not created by
        # BirthdayMessaging. Record and acknowledge them to avoid endless retries.
        if transaction is None:
            webhook_event.processing_status = "ignored"
            webhook_event.processed_at = datetime.now(timezone.utc)
            webhook_event.processing_error = "invoice_not_found"
            await db.commit()
            return {
                "received": True,
                "processed": False,
                "reason": "invoice_not_found",
            }

        now = datetime.now(timezone.utc)

        new_status = _BTCPAY_EVENT_STATUS.get(event_type)
        if new_status is not None:
            transaction.status = new_status

        # Only a fully settled INVOICE is authoritative for completed payment.
        # Intermediate/partial-payment events do not set paid_at.
        if event_type == "InvoiceSettled" and transaction.paid_at is None:
            transaction.paid_at = now

        transaction.updated_at = now

        metadata = dict(transaction.metadata_payload or {})
        metadata.update(
            {
                "btcpay_invoice_id": invoice_id,
                "last_btcpay_event": event_type,
                "last_btcpay_event_at": now.isoformat(),
            }
        )

        if "status" in event:
            metadata["btcpay_event_status"] = event["status"]
        if "additionalStatus" in event:
            metadata["btcpay_additional_status"] = event["additionalStatus"]

        transaction.metadata_payload = metadata

        webhook_event.processing_status = "processed"
        webhook_event.processed_at = now
        webhook_event.processing_error = None

        # Commit the payment mutation and event completion together.
        await db.commit()
    except Exception as exc:
        await db.rollback()

        # Best-effort failure recording in a fresh transaction so a later
        # BTCPay redelivery can retry this logical event.
        try:
            failed_result = await db.execute(
                select(PaymentWebhookEvent).where(
                    PaymentWebhookEvent.provider == "btcpay",
                    PaymentWebhookEvent.provider_event_id == original_delivery_id,
                )
            )
            failed_event = failed_result.scalar_one_or_none()
            if failed_event is not None:
                failed_event.processing_status = "failed"
                failed_event.processed_at = datetime.now(timezone.utc)
                failed_event.processing_error = str(exc)[:4000]
                await db.commit()
        except Exception:
            await db.rollback()

        raise

    return {
        "received": True,
        "processed": True,
        "event": event_type or "unknown",
    }
