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
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import PaymentTransaction, User
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

    Security rules:
    - This route intentionally does NOT use end-user JWT authentication.
      BTCPay Server calls it directly.
    - Authenticity is established with BTCPAY-SIG over the exact raw body.
    - The frontend never decides whether a payment is settled.
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

    # BTCPay may send other store-level events if the webhook is configured
    # broadly. Acknowledge events unrelated to an invoice.
    if not invoice_id:
        return {"received": True, "processed": False}

    result = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.provider == "btcpay",
            PaymentTransaction.provider_payment_id == invoice_id,
        )
    )
    transaction = result.scalar_one_or_none()

    # The same BTCPay store may contain invoices that were not created by
    # BirthdayMessaging. Acknowledge those rather than causing endless retries.
    if transaction is None:
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
    # InvoiceReceivedPayment / InvoicePaymentSettled can represent intermediate
    # or partial-payment activity and therefore do not set paid_at here.
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

    # Keep useful BTCPay status detail without allowing payload data to
    # overwrite trusted application fields.
    if "status" in event:
        metadata["btcpay_event_status"] = event["status"]
    if "additionalStatus" in event:
        metadata["btcpay_additional_status"] = event["additionalStatus"]

    transaction.metadata_payload = metadata

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {
        "received": True,
        "processed": True,
        "event": event_type or "unknown",
    }

