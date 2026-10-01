"""BirthdayMessaging payment endpoints.

Phase 2 intentionally exposes only a controlled BTCPay test-invoice endpoint.
Production plan pricing and subscription activation are added in later phases.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.errors import AppError, ErrorCodes
from app.db.models import PaymentCheckoutAttempt, PaymentTransaction, PaymentWebhookEvent, User
from app.db.session import get_db
from app.schemas.payment import BTCPayCheckoutRequest, BTCPayCheckoutResponse, BTCPayCheckoutStatusResponse, BTCPayTestInvoiceResponse, RapydCheckoutRequest, PayPalCheckoutRequest
from app.services.btcpay import create_invoice, public_checkout_url, find_invoice_by_order_id
from app.services.rapyd import (
    RapydConfigurationError,
    RapydProviderError,
    RapydRateLimitError,
    RapydResponseError,
    RapydTransportError,
    RapydWebhookAuthenticationError,
    RapydWebhookPayloadError,
    create_hosted_checkout,
    verify_webhook_signature,
)
from app.services.paypal import (
    PayPalConfigurationError,
    PayPalProviderError,
    PayPalResponseError,
    PayPalTransportError,
    PayPalWebhookAuthenticationError,
    approval_url as paypal_approval_url,
    capture_order as paypal_capture_order,
    create_order as paypal_create_order,
    verify_webhook as verify_paypal_webhook,
)
from app.services.paypal_settlement import settle_paypal_capture
from app.services.entitlements import grant_entitlement_for_settled_payment
from app.services.rapyd_settlement import settle_rapyd_payment_snapshot
from app.services.notifications import enqueue_payment_lifecycle_notifications
from app.services.payment_plans import get_payment_plan


router = APIRouter()

_IDEMPOTENCY_MIN_LENGTH = 16
_IDEMPOTENCY_MAX_LENGTH = 128
_CHECKOUT_CLAIM_SECONDS = 120


def _require_provider_enabled(provider: str) -> None:
    enabled = {
        "paypal": settings.paypal_enabled,
        "rapyd": settings.rapyd_enabled,
    }.get(provider)
    if enabled is not True:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider.title()} payments are not enabled.",
        )


def _validate_idempotency_key(value: str | None) -> str:
    if value is None or not value.strip():
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.PAYMENT_IDEMPOTENCY_REQUIRED,
            "An Idempotency-Key header is required for payment checkout.",
        )

    key = value.strip()
    if not (_IDEMPOTENCY_MIN_LENGTH <= len(key) <= _IDEMPOTENCY_MAX_LENGTH):
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.PAYMENT_IDEMPOTENCY_INVALID,
            "The Idempotency-Key header has an invalid length.",
        )

    if not all(ch.isalnum() or ch in "._:-" for ch in key):
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.PAYMENT_IDEMPOTENCY_INVALID,
            "The Idempotency-Key header contains unsupported characters.",
        )

    return key


def _checkout_response(
    attempt: PaymentCheckoutAttempt,
    transaction: PaymentTransaction,
    *,
    reused: bool,
) -> BTCPayCheckoutResponse:
    metadata = transaction.metadata_payload or {}
    return BTCPayCheckoutResponse(
        checkout_attempt_id=str(attempt.id),
        payment_id=str(transaction.id),
        provider=transaction.provider,
        provider_payment_id=transaction.provider_payment_id or "",
        provider_order_id=transaction.provider_order_id or "",
        status=transaction.status,
        checkout_url=transaction.checkout_url or "",
        amount=transaction.amount,
        currency=transaction.currency,
        plan_code=transaction.plan_code or attempt.plan_code,
        billing_term_months=int(metadata.get("billing_term_months") or 0),
        reused=reused,
    )


async def _existing_checkout_transaction(
    db: AsyncSession,
    attempt: PaymentCheckoutAttempt,
) -> PaymentTransaction | None:
    result = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.checkout_attempt_id == attempt.id
        )
    )
    return result.scalar_one_or_none()


async def _finalize_checkout(
    *,
    db: AsyncSession,
    attempt: PaymentCheckoutAttempt,
    invoice: dict,
    term_months: int,
) -> PaymentTransaction:
    provider_payment_id = str(invoice.get("id") or "")
    checkout_url = public_checkout_url(str(invoice.get("checkoutLink") or ""))
    provider_status = str(invoice.get("status") or "New")

    if not provider_payment_id or not checkout_url:
        raise AppError(
            status.HTTP_502_BAD_GATEWAY,
            ErrorCodes.PAYMENT_CHECKOUT_INCONSISTENT,
            "BTCPay returned incomplete checkout information.",
        )

    existing = await _existing_checkout_transaction(db, attempt)
    if existing is not None:
        return existing

    now = datetime.now(timezone.utc)
    transaction = PaymentTransaction(
        id=uuid4(),
        user_id=attempt.user_id,
        provider="btcpay",
        provider_payment_id=provider_payment_id,
        provider_order_id=attempt.provider_order_id,
        checkout_attempt_id=attempt.id,
        amount=attempt.amount,
        currency=attempt.currency,
        status=provider_status,
        checkout_url=checkout_url,
        payment_method=str((attempt.metadata_payload or {}).get("payment_method") or "bitcoin"),
        plan_code=attempt.plan_code,
        paid_at=None,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={
            "btcpay_invoice_id": provider_payment_id,
            "checkout_attempt_id": str(attempt.id),
            "billing_term_months": term_months,
            "payment_method": str((attempt.metadata_payload or {}).get("payment_method") or "bitcoin"),
            "phase": "production-checkout",
        },
    )
    db.add(transaction)

    attempt.provider_payment_id = provider_payment_id
    attempt.checkout_url = checkout_url
    attempt.status = "completed"
    attempt.failure_code = None
    attempt.claim_expires_at = None
    attempt.completed_at = now
    attempt.updated_at = now

    await db.commit()
    await db.refresh(attempt)
    await db.refresh(transaction)
    return transaction


@router.post(
    "/btcpay/checkout",
    response_model=BTCPayCheckoutResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_btcpay_checkout(
    payload: BTCPayCheckoutRequest,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BTCPayCheckoutResponse:
    """Create or safely reuse one production BTCPay checkout.

    Security / consistency rules:
    - client selects only plan_code; price and term come from the backend catalog;
    - Idempotency-Key is scoped to provider + user;
    - a durable checkout attempt is committed before the external provider call;
    - deterministic orderId permits crash recovery through provider reconciliation;
    - the same idempotency key may never be reused for a different plan;
    - active duplicate requests never create another provider invoice.
    """
    key = _validate_idempotency_key(idempotency_key)
    plan = get_payment_plan(payload.plan_code)
    requested_payment_method = payload.payment_method
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(PaymentCheckoutAttempt).where(
            PaymentCheckoutAttempt.provider == "btcpay",
            PaymentCheckoutAttempt.user_id == current_user.id,
            PaymentCheckoutAttempt.idempotency_key == key,
        )
    )
    attempt = result.scalar_one_or_none()

    if attempt is not None:
        stored_method = str((attempt.metadata_payload or {}).get("payment_method") or "bitcoin")
        if attempt.plan_code != plan.code or stored_method != requested_payment_method:
            raise AppError(
                status.HTTP_409_CONFLICT,
                ErrorCodes.PAYMENT_IDEMPOTENCY_CONFLICT,
                "This Idempotency-Key was already used for a different payment plan or payment method.",
            )

        existing_tx = await _existing_checkout_transaction(db, attempt)
        if existing_tx is not None:
            response.status_code = status.HTTP_200_OK
            return _checkout_response(attempt, existing_tx, reused=True)

        # Recovery path for a crash after BTCPay accepted the invoice but before
        # our local PaymentTransaction was committed.
        invoice = await find_invoice_by_order_id(attempt.provider_order_id)
        if invoice is not None:
            transaction = await _finalize_checkout(
                db=db,
                attempt=attempt,
                invoice=invoice,
                term_months=plan.term_months,
            )
            response.status_code = status.HTTP_200_OK
            return _checkout_response(attempt, transaction, reused=True)

        claim_expires_at = attempt.claim_expires_at
        if claim_expires_at is not None:
            if claim_expires_at.tzinfo is None:
                claim_expires_at = claim_expires_at.replace(tzinfo=timezone.utc)
            if claim_expires_at > now:
                raise AppError(
                    status.HTTP_409_CONFLICT,
                    ErrorCodes.PAYMENT_CHECKOUT_IN_PROGRESS,
                    "Payment checkout is already being created. Retry with the same Idempotency-Key.",
                )

        # A stale claim with no provider invoice can be safely reclaimed.
        attempt.status = "claimed"
        attempt.failure_code = None
        attempt.claim_expires_at = now + timedelta(seconds=_CHECKOUT_CLAIM_SECONDS)
        attempt.updated_at = now
        await db.commit()
    else:
        attempt_id = uuid4()
        attempt = PaymentCheckoutAttempt(
            id=attempt_id,
            user_id=current_user.id,
            provider="btcpay",
            idempotency_key=key,
            plan_code=plan.code,
            amount=plan.amount,
            currency=plan.currency,
            provider_order_id=f"BM-{attempt_id}",
            provider_payment_id=None,
            checkout_url=None,
            status="claimed",
            failure_code=None,
            claim_expires_at=now + timedelta(seconds=_CHECKOUT_CLAIM_SECONDS),
            completed_at=None,
            created_at=now,
            updated_at=now,
            metadata_payload={
                "billing_term_months": plan.term_months,
                "catalog_price_env": plan.price_env_name,
                "payment_method": requested_payment_method,
            },
        )
        db.add(attempt)

        try:
            await db.commit()
            await db.refresh(attempt)
        except IntegrityError:
            await db.rollback()
            result = await db.execute(
                select(PaymentCheckoutAttempt).where(
                    PaymentCheckoutAttempt.provider == "btcpay",
                    PaymentCheckoutAttempt.user_id == current_user.id,
                    PaymentCheckoutAttempt.idempotency_key == key,
                )
            )
            attempt = result.scalar_one_or_none()
            if attempt is None:
                raise

            stored_method = str((attempt.metadata_payload or {}).get("payment_method") or "bitcoin")
            if attempt.plan_code != plan.code or stored_method != requested_payment_method:
                raise AppError(
                    status.HTTP_409_CONFLICT,
                    ErrorCodes.PAYMENT_IDEMPOTENCY_CONFLICT,
                    "This Idempotency-Key was already used for a different payment plan or payment method.",
                )

            existing_tx = await _existing_checkout_transaction(db, attempt)
            if existing_tx is not None:
                response.status_code = status.HTTP_200_OK
                return _checkout_response(attempt, existing_tx, reused=True)

            raise AppError(
                status.HTTP_409_CONFLICT,
                ErrorCodes.PAYMENT_CHECKOUT_IN_PROGRESS,
                "Payment checkout is already being created. Retry with the same Idempotency-Key.",
            )

    try:
        invoice = await create_invoice(
            amount=plan.amount,
            currency=plan.currency,
            order_id=attempt.provider_order_id,
            description=plan.display_name,
            user_id=str(current_user.id),
            buyer_email=str(current_user.email),
            payment_method=requested_payment_method,
        )
    except HTTPException as exc:
        # Provider/network failures are treated as uncertain because the invoice
        # may have been accepted before the response was lost. Do NOT immediately
        # create a second invoice. A retry with the same key reconciles by orderId.
        attempt.status = "uncertain"
        attempt.failure_code = "provider_create_uncertain"
        attempt.claim_expires_at = now + timedelta(minutes=10)
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            ErrorCodes.PAYMENT_PROVIDER_UNCERTAIN,
            "Payment provider status is uncertain. Retry with the same Idempotency-Key; do not start a second checkout.",
        ) from exc

    transaction = await _finalize_checkout(
        db=db,
        attempt=attempt,
        invoice=invoice,
        term_months=plan.term_months,
    )

    return _checkout_response(attempt, transaction, reused=False)


async def _finalize_paypal_checkout(*, db: AsyncSession, attempt: PaymentCheckoutAttempt, order: dict, term_months: int) -> PaymentTransaction:
    order_id = str(order.get("id") or "").strip()
    checkout_url = paypal_approval_url(order)
    provider_status = str(order.get("status") or "CREATED")
    if not order_id:
        raise AppError(status.HTTP_502_BAD_GATEWAY, ErrorCodes.PAYMENT_CHECKOUT_INCONSISTENT, "PayPal returned incomplete checkout information.")
    existing = await _existing_checkout_transaction(db, attempt)
    if existing is not None:
        return existing
    now = datetime.now(timezone.utc)
    transaction = PaymentTransaction(id=uuid4(), user_id=attempt.user_id, provider="paypal", provider_payment_id=None, provider_order_id=order_id, checkout_attempt_id=attempt.id, amount=attempt.amount, currency=attempt.currency, status=provider_status, checkout_url=checkout_url, payment_method="paypal", plan_code=attempt.plan_code, paid_at=None, expires_at=None, created_at=now, updated_at=now, metadata_payload={"paypal_order_id": order_id, "checkout_attempt_id": str(attempt.id), "billing_term_months": term_months, "payment_method": "paypal", "phase": "production-checkout"})
    db.add(transaction)
    attempt.provider_order_id = order_id
    attempt.checkout_url = checkout_url
    attempt.status = "completed"
    attempt.failure_code = None
    attempt.claim_expires_at = None
    attempt.completed_at = now
    attempt.updated_at = now
    await db.commit()
    await db.refresh(attempt)
    await db.refresh(transaction)
    return transaction

@router.post("/paypal/checkout", response_model=BTCPayCheckoutResponse, status_code=status.HTTP_201_CREATED)
async def create_paypal_checkout(payload: PayPalCheckoutRequest, response: Response, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> BTCPayCheckoutResponse:
    _require_provider_enabled("paypal")
    key = _validate_idempotency_key(idempotency_key)
    plan = get_payment_plan(payload.plan_code)
    now = datetime.now(timezone.utc)
    attempt = (await db.execute(select(PaymentCheckoutAttempt).where(PaymentCheckoutAttempt.provider == "paypal", PaymentCheckoutAttempt.user_id == current_user.id, PaymentCheckoutAttempt.idempotency_key == key))).scalar_one_or_none()
    if attempt is not None:
        if attempt.plan_code != plan.code:
            raise AppError(status.HTTP_409_CONFLICT, ErrorCodes.PAYMENT_IDEMPOTENCY_CONFLICT, "This Idempotency-Key was already used for a different payment plan.")
        existing = await _existing_checkout_transaction(db, attempt)
        if existing is not None:
            response.status_code = status.HTTP_200_OK
            return _checkout_response(attempt, existing, reused=True)
        raise AppError(status.HTTP_409_CONFLICT, ErrorCodes.PAYMENT_CHECKOUT_IN_PROGRESS, "Payment checkout is awaiting provider reconciliation. Retry with the same Idempotency-Key; do not start a second checkout.")
    attempt_id = uuid4()
    attempt = PaymentCheckoutAttempt(id=attempt_id, user_id=current_user.id, provider="paypal", idempotency_key=key, plan_code=plan.code, amount=plan.amount, currency=plan.currency, provider_order_id=f"BM-PAYPAL-{attempt_id}", provider_payment_id=None, checkout_url=None, status="claimed", failure_code=None, claim_expires_at=now + timedelta(seconds=_CHECKOUT_CLAIM_SECONDS), completed_at=None, created_at=now, updated_at=now, metadata_payload={"billing_term_months": plan.term_months, "catalog_price_env": plan.price_env_name, "payment_method": "paypal"})
    db.add(attempt)
    try:
        await db.commit()
        await db.refresh(attempt)
    except IntegrityError as exc:
        await db.rollback()
        raise AppError(status.HTTP_409_CONFLICT, ErrorCodes.PAYMENT_CHECKOUT_IN_PROGRESS, "Payment checkout is already being created. Retry with the same Idempotency-Key.") from exc
    try:
        order = await paypal_create_order(amount=plan.amount, currency=plan.currency, description=plan.display_name, custom_id=attempt.provider_order_id, idempotency_key=key)
    except (PayPalTransportError, PayPalResponseError) as exc:
        attempt.status = "uncertain"
        attempt.failure_code = "provider_create_uncertain"
        attempt.claim_expires_at = now + timedelta(minutes=10)
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise AppError(status.HTTP_503_SERVICE_UNAVAILABLE, ErrorCodes.PAYMENT_PROVIDER_UNCERTAIN, "Payment provider status is uncertain. Retry with the same Idempotency-Key; do not start a second checkout.") from exc
    except PayPalConfigurationError as exc:
        attempt.status = "failed"
        attempt.failure_code = "provider_configuration"
        attempt.claim_expires_at = None
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise AppError(status.HTTP_503_SERVICE_UNAVAILABLE, ErrorCodes.INTERNAL_SERVER_ERROR, "PayPal payments are temporarily unavailable.") from exc
    except PayPalProviderError as exc:
        attempt.status = "failed"
        attempt.failure_code = "provider_rejected"
        attempt.claim_expires_at = None
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise AppError(status.HTTP_502_BAD_GATEWAY, ErrorCodes.BAD_REQUEST, "The payment provider could not create this checkout.") from exc
    transaction = await _finalize_paypal_checkout(db=db, attempt=attempt, order=order, term_months=plan.term_months)
    return _checkout_response(attempt, transaction, reused=False)

async def _finalize_rapyd_checkout(
    *,
    db: AsyncSession,
    attempt: PaymentCheckoutAttempt,
    checkout: dict,
    term_months: int,
) -> PaymentTransaction:
    provider_payment_id = str(checkout.get("id") or "")
    checkout_url = str(checkout.get("redirect_url") or "")
    provider_status = str(checkout.get("status") or "NEW")
    if not provider_payment_id or not checkout_url or not checkout_url.startswith("https://"):
        raise AppError(
            status.HTTP_502_BAD_GATEWAY,
            ErrorCodes.PAYMENT_CHECKOUT_INCONSISTENT,
            "Rapyd returned incomplete checkout information.",
        )
    existing = await _existing_checkout_transaction(db, attempt)
    if existing is not None:
        return existing
    now = datetime.now(timezone.utc)
    transaction = PaymentTransaction(
        id=uuid4(), user_id=attempt.user_id, provider="rapyd",
        provider_payment_id=None,
        provider_order_id=attempt.provider_order_id,
        checkout_attempt_id=attempt.id, amount=attempt.amount,
        currency=attempt.currency, status=provider_status,
        checkout_url=checkout_url, payment_method="rapyd_hosted_checkout",
        plan_code=attempt.plan_code, paid_at=None, expires_at=None,
        created_at=now, updated_at=now,
        metadata_payload={
            "rapyd_checkout_id": provider_payment_id,
            "checkout_attempt_id": str(attempt.id),
            "billing_term_months": term_months,
            "payment_method": "rapyd_hosted_checkout",
            "phase": "production-checkout",
        },
    )
    db.add(transaction)
    attempt.provider_payment_id = provider_payment_id
    attempt.checkout_url = checkout_url
    attempt.status = "completed"
    attempt.failure_code = None
    attempt.claim_expires_at = None
    attempt.completed_at = now
    attempt.updated_at = now
    await db.commit()
    await db.refresh(attempt)
    await db.refresh(transaction)
    return transaction


@router.post(
    "/rapyd/checkout",
    response_model=BTCPayCheckoutResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_rapyd_checkout(
    payload: RapydCheckoutRequest,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BTCPayCheckoutResponse:
    """Create one durable Rapyd checkout; never duplicate ambiguous attempts."""
    _require_provider_enabled("rapyd")
    key = _validate_idempotency_key(idempotency_key)
    plan = get_payment_plan(payload.plan_code)
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PaymentCheckoutAttempt).where(
            PaymentCheckoutAttempt.provider == "rapyd",
            PaymentCheckoutAttempt.user_id == current_user.id,
            PaymentCheckoutAttempt.idempotency_key == key,
        )
    )
    attempt = result.scalar_one_or_none()
    if attempt is not None:
        if attempt.plan_code != plan.code:
            raise AppError(
                status.HTTP_409_CONFLICT,
                ErrorCodes.PAYMENT_IDEMPOTENCY_CONFLICT,
                "This Idempotency-Key was already used for a different payment plan.",
            )
        existing_tx = await _existing_checkout_transaction(db, attempt)
        if existing_tx is not None:
            response.status_code = status.HTTP_200_OK
            return _checkout_response(attempt, existing_tx, reused=True)
        if attempt.status in {"claimed", "uncertain"}:
            raise AppError(
                status.HTTP_409_CONFLICT,
                ErrorCodes.PAYMENT_CHECKOUT_IN_PROGRESS,
                "Payment checkout is awaiting provider reconciliation. Retry with the same Idempotency-Key; do not start a second checkout.",
            )
        raise AppError(
            status.HTTP_409_CONFLICT,
            ErrorCodes.PAYMENT_CHECKOUT_NOT_RECOVERABLE,
            "This payment checkout cannot be reused.",
        )

    attempt_id = uuid4()
    attempt = PaymentCheckoutAttempt(
        id=attempt_id, user_id=current_user.id, provider="rapyd",
        idempotency_key=key, plan_code=plan.code, amount=plan.amount,
        currency=plan.currency, provider_order_id=f"BM-RAPYD-{attempt_id}",
        provider_payment_id=None, checkout_url=None, status="claimed",
        failure_code=None,
        claim_expires_at=now + timedelta(seconds=_CHECKOUT_CLAIM_SECONDS),
        completed_at=None, created_at=now, updated_at=now,
        metadata_payload={
            "billing_term_months": plan.term_months,
            "catalog_price_env": plan.price_env_name,
            "payment_method": "rapyd_hosted_checkout",
        },
    )
    db.add(attempt)
    try:
        await db.commit()
        await db.refresh(attempt)
    except IntegrityError:
        await db.rollback()
        result = await db.execute(
            select(PaymentCheckoutAttempt).where(
                PaymentCheckoutAttempt.provider == "rapyd",
                PaymentCheckoutAttempt.user_id == current_user.id,
                PaymentCheckoutAttempt.idempotency_key == key,
            )
        )
        attempt = result.scalar_one_or_none()
        if attempt is None:
            raise
        if attempt.plan_code != plan.code:
            raise AppError(
                status.HTTP_409_CONFLICT,
                ErrorCodes.PAYMENT_IDEMPOTENCY_CONFLICT,
                "This Idempotency-Key was already used for a different payment plan.",
            )
        existing_tx = await _existing_checkout_transaction(db, attempt)
        if existing_tx is not None:
            response.status_code = status.HTTP_200_OK
            return _checkout_response(attempt, existing_tx, reused=True)
        raise AppError(
            status.HTTP_409_CONFLICT,
            ErrorCodes.PAYMENT_CHECKOUT_IN_PROGRESS,
            "Payment checkout is already being created. Retry with the same Idempotency-Key.",
        )

    try:
        checkout = await create_hosted_checkout(
            amount=plan.amount, currency=plan.currency,
            merchant_reference_id=attempt.provider_order_id,
            idempotency_key=key, description=plan.display_name,
        )
    except RapydRateLimitError as exc:
        attempt.status = "uncertain"
        attempt.failure_code = "provider_rate_limited"
        attempt.claim_expires_at = now + timedelta(minutes=10)
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        headers = {"Retry-After": str(int(exc.retry_after))} if exc.retry_after is not None else None
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            ErrorCodes.PAYMENT_PROVIDER_UNCERTAIN,
            "Payment provider is temporarily busy. Retry with the same Idempotency-Key; do not start a second checkout.",
            headers=headers,
        ) from exc
    except (RapydTransportError, RapydResponseError) as exc:
        attempt.status = "uncertain"
        attempt.failure_code = "provider_create_uncertain"
        attempt.claim_expires_at = now + timedelta(minutes=10)
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            ErrorCodes.PAYMENT_PROVIDER_UNCERTAIN,
            "Payment provider status is uncertain. Retry with the same Idempotency-Key; do not start a second checkout.",
        ) from exc
    except RapydConfigurationError as exc:
        attempt.status = "failed"
        attempt.failure_code = "provider_configuration"
        attempt.claim_expires_at = None
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            ErrorCodes.INTERNAL_SERVER_ERROR,
            "Card payments are temporarily unavailable.",
        ) from exc
    except RapydProviderError as exc:
        attempt.status = "failed"
        attempt.failure_code = "provider_rejected"
        attempt.claim_expires_at = None
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise AppError(
            status.HTTP_502_BAD_GATEWAY,
            ErrorCodes.BAD_REQUEST,
            "The payment provider could not create this checkout.",
        ) from exc

    try:
        transaction = await _finalize_rapyd_checkout(
            db=db, attempt=attempt, checkout=checkout, term_months=plan.term_months
        )
    except AppError:
        attempt.status = "uncertain"
        attempt.failure_code = "provider_response_inconsistent"
        attempt.claim_expires_at = now + timedelta(minutes=10)
        attempt.updated_at = datetime.now(timezone.utc)
        await db.commit()
        raise
    return _checkout_response(attempt, transaction, reused=False)

def _checkout_status_response(
    attempt: PaymentCheckoutAttempt,
    transaction: PaymentTransaction | None,
) -> BTCPayCheckoutStatusResponse:
    metadata = attempt.metadata_payload or {}
    payment_metadata = transaction.metadata_payload if transaction is not None else {}
    term_months = int(
        (payment_metadata or {}).get("billing_term_months")
        or metadata.get("billing_term_months")
        or 0
    )

    return BTCPayCheckoutStatusResponse(
        checkout_attempt_id=str(attempt.id),
        provider=attempt.provider,
        provider_order_id=attempt.provider_order_id,
        provider_payment_id=(
            transaction.provider_payment_id
            if transaction is not None
            else attempt.provider_payment_id
        ),
        payment_id=str(transaction.id) if transaction is not None else None,
        checkout_url=(
            transaction.checkout_url
            if transaction is not None
            else attempt.checkout_url
        ),
        checkout_status=attempt.status,
        payment_status=transaction.status if transaction is not None else None,
        amount=attempt.amount,
        currency=attempt.currency,
        plan_code=attempt.plan_code,
        billing_term_months=term_months,
        created_at=attempt.created_at,
        updated_at=attempt.updated_at,
        completed_at=attempt.completed_at,
        recoverable=(
            transaction is None
            and attempt.status in {"claimed", "uncertain"}
        ),
    )


async def _owned_checkout_attempt(
    *,
    db: AsyncSession,
    current_user: User,
    checkout_attempt_id: str,
) -> PaymentCheckoutAttempt:
    try:
        parsed_id = UUID(checkout_attempt_id)
    except (TypeError, ValueError):
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.PAYMENT_CHECKOUT_NOT_FOUND,
            "Payment checkout was not found.",
        )

    result = await db.execute(
        select(PaymentCheckoutAttempt).where(
            PaymentCheckoutAttempt.id == parsed_id,
            PaymentCheckoutAttempt.user_id == current_user.id,
            PaymentCheckoutAttempt.provider == "btcpay",
        )
    )
    attempt = result.scalar_one_or_none()

    if attempt is None:
        # Do not reveal whether another user's checkout exists.
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.PAYMENT_CHECKOUT_NOT_FOUND,
            "Payment checkout was not found.",
        )

    return attempt


@router.get(
    "/btcpay/checkouts/{checkout_attempt_id}",
    response_model=BTCPayCheckoutStatusResponse,
)
async def get_btcpay_checkout_status(
    checkout_attempt_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BTCPayCheckoutStatusResponse:
    """Return the authenticated user's durable local checkout/payment state."""
    attempt = await _owned_checkout_attempt(
        db=db,
        current_user=current_user,
        checkout_attempt_id=checkout_attempt_id,
    )
    transaction = await _existing_checkout_transaction(db, attempt)
    return _checkout_status_response(attempt, transaction)


@router.post(
    "/btcpay/checkouts/{checkout_attempt_id}/reconcile",
    response_model=BTCPayCheckoutStatusResponse,
)
async def reconcile_btcpay_checkout(
    checkout_attempt_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BTCPayCheckoutStatusResponse:
    """Recover a checkout whose provider outcome may be uncertain.

    This endpoint never creates a new BTCPay invoice. It can only discover the
    invoice with the attempt's deterministic provider_order_id and bind that
    existing provider invoice to the local payment ledger.
    """
    attempt = await _owned_checkout_attempt(
        db=db,
        current_user=current_user,
        checkout_attempt_id=checkout_attempt_id,
    )

    transaction = await _existing_checkout_transaction(db, attempt)
    if transaction is not None:
        return _checkout_status_response(attempt, transaction)

    if attempt.status not in {"claimed", "uncertain"}:
        raise AppError(
            status.HTTP_409_CONFLICT,
            ErrorCodes.PAYMENT_CHECKOUT_NOT_RECOVERABLE,
            "This payment checkout is not in a recoverable state.",
        )

    invoice = await find_invoice_by_order_id(attempt.provider_order_id)
    if invoice is None:
        # Keep uncertain claims recoverable. We deliberately do not create a
        # replacement provider invoice here because the provider outcome may
        # still be delayed or unavailable.
        return _checkout_status_response(attempt, None)

    plan = get_payment_plan(attempt.plan_code)
    transaction = await _finalize_checkout(
        db=db,
        attempt=attempt,
        invoice=invoice,
        term_months=plan.term_months,
    )
    return _checkout_status_response(attempt, transaction)

# Server-controlled development amount. The browser cannot choose the price.
_TEST_AMOUNT = Decimal("1.00")
_TEST_CURRENCY = "USD"
_TEST_PLAN_CODE = "btcpay-integration-test"
_TEST_TERM_MONTHS = 1


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
    checkout_url = public_checkout_url(str(invoice.get("checkoutLink") or ""))
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
            "billing_term_months": _TEST_TERM_MONTHS,
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


@router.post("/paypal/webhook", status_code=status.HTTP_200_OK)
async def paypal_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, bool | str]:
    _require_provider_enabled("paypal")
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            declared_bytes = int(declared_length)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Content-Length header.") from exc
        if declared_bytes < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Content-Length header.")
        if declared_bytes > settings.paypal_webhook_max_body_bytes:
            raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="PayPal webhook payload is too large.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > settings.paypal_webhook_max_body_bytes:
            raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="PayPal webhook payload is too large.")
        body.extend(chunk)
    try:
        event = json.loads(bytes(body).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid PayPal webhook payload.") from exc
    if not isinstance(event, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid PayPal webhook payload.")
    headers = {k.lower(): v for k, v in request.headers.items()}
    try:
        verified = await verify_paypal_webhook(headers, event)
    except PayPalWebhookAuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid PayPal webhook authentication.") from exc
    except PayPalConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="PayPal webhook is not configured.") from exc
    except (PayPalTransportError, PayPalProviderError, PayPalResponseError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="PayPal webhook verification is temporarily unavailable.") from exc
    if not verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid PayPal webhook authentication.")
    event_id = str(event.get("id") or "").strip()
    event_type = str(event.get("event_type") or "unknown").strip() or "unknown"
    if not event_id:
        return {"received": True, "processed": False, "reason": "missing_event_id", "event": event_type}
    resource = event.get("resource") if isinstance(event.get("resource"), dict) else {}
    capture_id = str(resource.get("id") or "").strip() if event_type == "PAYMENT.CAPTURE.COMPLETED" else ""
    ledger = PaymentWebhookEvent(provider="paypal", provider_event_id=event_id, provider_delivery_id=headers.get("paypal-transmission-id") or event_id, provider_payment_id=capture_id or None, event_type=event_type, is_redelivery=False, processing_status="received", payload=event)
    db.add(ledger)
    try:
        await db.commit()
        await db.refresh(ledger)
    except IntegrityError:
        await db.rollback()
        existing = (await db.execute(select(PaymentWebhookEvent).where(PaymentWebhookEvent.provider == "paypal", PaymentWebhookEvent.provider_event_id == event_id))).scalar_one_or_none()
        if existing is None:
            raise
        if existing.processing_status in {"processed", "ignored"}:
            return {"received": True, "processed": False, "reason": "duplicate_event", "event": existing.event_type or event_type}
        return {"received": True, "processed": False, "reason": "duplicate_in_progress", "event": existing.event_type or event_type}
    if event_type not in {"CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"}:
        ledger.processing_status = "ignored"
        ledger.processed_at = datetime.now(timezone.utc)
        await db.commit()
        return {"received": True, "processed": False, "reason": "non_settlement_event", "event": event_type}
    try:
        if event_type == "CHECKOUT.ORDER.APPROVED":
            order_id = str(resource.get("id") or "").strip()
            if not order_id:
                raise ValueError("Approved PayPal order is missing order id.")
            captured = await paypal_capture_order(order_id)
            units = captured.get("purchase_units") or []
            captures = ((units[0].get("payments") or {}).get("captures") or []) if units and isinstance(units[0], dict) else []
            capture = captures[0] if captures and isinstance(captures[0], dict) else {}
        else:
            capture = resource
            related = ((resource.get("supplementary_data") or {}).get("related_ids") or {})
            order_id = str(related.get("order_id") or "").strip()
        if not capture or not order_id:
            ledger.processing_status = "ignored"
            ledger.processing_error = "missing_capture_or_order_id"
            ledger.processed_at = datetime.now(timezone.utc)
            await db.commit()
            return {"received": True, "processed": False, "reason": "missing_capture_or_order_id", "event": event_type}
        outcome = await settle_paypal_capture(db=db, capture=capture, order_id=order_id, source="webhook:" + event_type)
        reason = str(outcome.get("reason") or "")
        settled = bool(outcome.get("settled"))
        if reason in {"payment_not_found", "payment_identity_already_bound"}:
            ledger.processing_status = "ignored"
            ledger.processing_error = reason
            processed = False
        else:
            ledger.processing_status = "processed"
            ledger.processing_error = None
            processed = True
        ledger.provider_payment_id = str(capture.get("id") or "") or ledger.provider_payment_id
        ledger.processed_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        failed = (await db.execute(select(PaymentWebhookEvent).where(PaymentWebhookEvent.provider == "paypal", PaymentWebhookEvent.provider_event_id == event_id))).scalar_one_or_none()
        if failed is not None:
            failed.processing_status = "failed"
            failed.processed_at = datetime.now(timezone.utc)
            failed.processing_error = str(exc)[:4000]
            await db.commit()
        return {"received": True, "processed": False, "reason": "settlement_failed", "event": event_type}
    return {"received": True, "processed": processed, "reason": reason, "event": event_type, "settled": settled}

@router.post("/rapyd/webhook", status_code=status.HTTP_200_OK)
async def rapyd_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool | str]:
    """Authenticate, ledger, and settle authoritative Rapyd payment events."""
    _require_provider_enabled("rapyd")
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            declared_bytes = int(declared_length)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Content-Length header.",
            ) from exc
        if declared_bytes < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Content-Length header.",
            )
        if declared_bytes > settings.rapyd_webhook_max_body_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Rapyd webhook payload is too large.",
            )

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > settings.rapyd_webhook_max_body_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Rapyd webhook payload is too large.",
            )
        body.extend(chunk)
    raw_body = bytes(body)
    try:
        event = verify_webhook_signature(
            raw_body=raw_body,
            salt=request.headers.get("salt", ""),
            timestamp=request.headers.get("timestamp", ""),
            signature=request.headers.get("signature", ""),
        )
    except RapydConfigurationError as exc:
        raise HTTPException(status_code=503, detail="Rapyd webhook is not configured.") from exc
    except RapydWebhookPayloadError as exc:
        raise HTTPException(status_code=400, detail="Invalid Rapyd webhook payload.") from exc
    except RapydWebhookAuthenticationError as exc:
        raise HTTPException(status_code=401, detail="Invalid Rapyd webhook authentication.") from exc

    event_id = str(event.get("id") or "").strip()
    event_type = str(event.get("type") or "unknown").strip() or "unknown"
    payment = event.get("data") if isinstance(event.get("data"), dict) else {}
    payment_id = str(payment.get("id") or "").strip()
    reference = str(payment.get("merchant_reference_id") or "").strip()
    if not event_id:
        return {"received": True, "processed": False, "reason": "missing_event_id", "event": event_type}

    ledger = PaymentWebhookEvent(
        provider="rapyd", provider_event_id=event_id, provider_delivery_id=event_id,
        provider_payment_id=payment_id or None, event_type=event_type,
        is_redelivery=False, processing_status="received", payload=event,
    )
    db.add(ledger)
    try:
        await db.commit()
        await db.refresh(ledger)
    except IntegrityError:
        await db.rollback()
        existing = (await db.execute(
            select(PaymentWebhookEvent).where(
                PaymentWebhookEvent.provider == "rapyd",
                PaymentWebhookEvent.provider_event_id == event_id,
            )
        )).scalar_one_or_none()
        if existing is None:
            raise
        if existing.processing_status in {"processed", "ignored"}:
            return {"received": True, "processed": False, "reason": "duplicate_event", "event": existing.event_type or event_type}
        if existing.processing_status in {"received", "pending_settlement"}:
            return {"received": True, "processed": False, "reason": "duplicate_in_progress", "event": existing.event_type or event_type}
        ledger = existing
        ledger.provider_payment_id = payment_id or ledger.provider_payment_id
        ledger.event_type = event_type
        ledger.payload = event
        ledger.processing_status = "received"
        ledger.processed_at = None
        ledger.processing_error = None
        await db.commit()

    if event_type != "PAYMENT_COMPLETED":
        ledger.processing_status = "ignored"
        ledger.processed_at = datetime.now(timezone.utc)
        await db.commit()
        return {"received": True, "processed": False, "reason": "non_settlement_event", "event": event_type}
    if not reference:
        ledger.processing_status = "ignored"
        ledger.processing_error = "missing_merchant_reference_id"
        ledger.processed_at = datetime.now(timezone.utc)
        await db.commit()
        return {"received": True, "processed": False, "reason": "missing_merchant_reference_id", "event": event_type}

    try:
        outcome = await settle_rapyd_payment_snapshot(
            db=db,
            payment=payment,
            source="webhook:" + event_type,
        )

        reason = str(outcome.get("reason") or "")
        settled = bool(outcome.get("settled"))

        if reason in {
            "payment_not_found",
            "payment_identity_already_bound",
            "missing_merchant_reference_id",
        }:
            ledger.processing_status = "ignored"
            ledger.processing_error = reason
            processed = False
        else:
            ledger.processing_status = "processed"
            ledger.processing_error = None
            processed = True

        ledger.processed_at = datetime.now(timezone.utc)
        await db.commit()

    except Exception as exc:
        await db.rollback()
        try:
            failed = (
                await db.execute(
                    select(PaymentWebhookEvent).where(
                        PaymentWebhookEvent.provider == "rapyd",
                        PaymentWebhookEvent.provider_event_id == event_id,
                    )
                )
            ).scalar_one_or_none()

            if failed is not None:
                failed.processing_status = "failed"
                failed.processed_at = datetime.now(timezone.utc)
                failed.processing_error = str(exc)[:4000]
                await db.commit()
        except Exception:
            await db.rollback()

        return {
            "received": True,
            "processed": False,
            "reason": "settlement_failed",
            "event": event_type,
        }

    return {
        "received": True,
        "processed": processed,
        "reason": reason,
        "event": event_type,
        "settled": settled,
    }

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

        # Full settlement is authoritative and monotonic:
        # once a payment has been fully settled, delayed/reordered lifecycle
        # events must never downgrade the local transaction back to
        # New/Processing/Expired/Invalid.
        #
        # Expired/Invalid/etc. may still become Settled later if BTCPay sends
        # a genuine InvoiceSettled event.
        already_settled = (
            transaction.status == "Settled" or transaction.paid_at is not None
        )

        # The user-facing business rule is full-payment-only. A payload that
        # explicitly says it is partial must never establish payment, even if
        # other provider fields are contradictory.
        is_partial_payment = bool(event.get("partiallyPaid", False)) or (
            str(event.get("additionalStatus") or "") == "PaidPartial"
        )

        is_full_settlement = (
            event_type == "InvoiceSettled" and not is_partial_payment
        )

        if is_full_settlement:
            transaction.status = "Settled"
            if transaction.paid_at is None:
                transaction.paid_at = now
        elif already_settled:
            # Preserve authoritative payment truth. The incoming event is still
            # retained in PaymentWebhookEvent and transaction metadata for audit.
            transaction.status = "Settled"
        elif event_type == "InvoiceSettled" and is_partial_payment:
            # Defensive contradiction handling:
            # a payload must never become locally "Settled" when BTCPay also
            # explicitly says the invoice is only partially paid. Keep it in a
            # non-final state and retain the provider details in metadata/audit.
            transaction.status = "Processing"
        elif new_status is not None:
            transaction.status = new_status

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

        # Access is a consequence of authoritative payment truth only.
        # The entitlement service is provider-neutral, idempotent, and runs in
        # this same database transaction so payment + access succeed together.
        if is_full_settlement:
            entitlement = await grant_entitlement_for_settled_payment(
                db=db,
                transaction=transaction,
            )
            user_result = await db.execute(
                select(User).where(User.id == transaction.user_id)
            )
            payment_user = user_result.scalar_one()
            await enqueue_payment_lifecycle_notifications(
                db=db,
                user=payment_user,
                transaction=transaction,
                entitlement=entitlement,
                now=now,
            )

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
