"""BTCPay Server Greenfield API client.

This module keeps BTCPay credentials server-side. Browser clients should call
BirthdayMessaging backend endpoints rather than BTCPay directly.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import requests
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings


def _require_config() -> None:
    missing: list[str] = []

    if not settings.btcpay_url.strip():
        missing.append("BTCPAY_URL")
    if not settings.btcpay_store_id.strip():
        missing.append("BTCPAY_STORE_ID")
    if not settings.btcpay_api_key.strip():
        missing.append("BTCPAY_API_KEY")

    if missing:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"BTCPay configuration is incomplete: {', '.join(missing)}",
        )


def _create_invoice_sync(payload: dict[str, Any]) -> dict[str, Any]:
    """Create one invoice through the BTCPay Greenfield API."""
    _require_config()

    url = (
        f"{settings.btcpay_url.rstrip('/')}/api/v1/stores/"
        f"{settings.btcpay_store_id}/invoices"
    )

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"token {settings.btcpay_api_key}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BirthdayMessaging could not reach BTCPay Server.",
        ) from exc

    if not response.ok:
        # Deliberately do not return provider response bodies because they may
        # contain operational details not intended for browser clients.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"BTCPay invoice creation failed with HTTP {response.status_code}.",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BTCPay Server returned an invalid JSON response.",
        ) from exc

    if not isinstance(data, dict) or not data.get("id"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BTCPay Server returned an incomplete invoice response.",
        )

    return data


async def create_invoice(
    *,
    amount: Decimal,
    currency: str,
    order_id: str,
    description: str,
    user_id: str,
    buyer_email: str | None = None,
    payment_method: str = "bitcoin",
) -> dict[str, Any]:
    """Create a BTCPay invoice without blocking FastAPI's event loop."""
    metadata: dict[str, Any] = {
        "orderId": order_id,
        "itemDesc": description,
        "birthdayMessagingUserId": user_id,
    }

    if buyer_email:
        metadata["buyerEmail"] = buyer_email

    normalized_method = payment_method.strip().lower()
    if normalized_method not in {"bitcoin", "monero"}:
        raise ValueError("Unsupported BTCPay payment method.")

    payload: dict[str, Any] = {
        "amount": format(amount, "f"),
        "currency": currency.upper(),
        "metadata": metadata,
    }

    payment_rail = {
        "bitcoin": "BTC-CHAIN",
        "monero": "XMR-CHAIN",
    }[normalized_method]

    # PAYMENT_RAIL_ISOLATION_HARDENING
    # Always constrain BTCPay to the rail explicitly selected by the user.
    # Never silently fall back from BTC to XMR (or vice versa).
    payload["checkout"] = {
        "paymentMethods": [payment_rail],
        "defaultPaymentMethod": payment_rail,
    }

    return await run_in_threadpool(_create_invoice_sync, payload)

def _find_invoice_by_order_id_sync(order_id: str) -> dict[str, Any] | None:
    """Find exactly one BTCPay invoice carrying our deterministic orderId.

    The Greenfield invoice-list API supports textSearch. We still filter the
    returned collection locally for an exact metadata.orderId match so a fuzzy
    provider search cannot bind the wrong customer payment.
    """
    _require_config()

    url = (
        f"{settings.btcpay_url.rstrip('/')}/api/v1/stores/"
        f"{settings.btcpay_store_id}/invoices"
    )

    try:
        response = requests.get(
            url,
            headers={
                "Authorization": f"token {settings.btcpay_api_key}",
                "Accept": "application/json",
            },
            params={"textSearch": order_id, "take": 100},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BirthdayMessaging could not reconcile the BTCPay invoice.",
        ) from exc

    if not response.ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"BTCPay invoice reconciliation failed with HTTP {response.status_code}.",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BTCPay Server returned invalid invoice reconciliation data.",
        ) from exc

    if not isinstance(data, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BTCPay Server returned an unexpected invoice reconciliation response.",
        )

    exact = []
    for invoice in data:
        if not isinstance(invoice, dict):
            continue
        metadata = invoice.get("metadata")
        if isinstance(metadata, dict) and str(metadata.get("orderId") or "") == order_id:
            exact.append(invoice)

    if len(exact) > 1:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BTCPay invoice reconciliation found multiple invoices for one order.",
        )

    return exact[0] if exact else None


async def find_invoice_by_order_id(order_id: str) -> dict[str, Any] | None:
    """Async wrapper for deterministic BTCPay order reconciliation."""
    return await run_in_threadpool(_find_invoice_by_order_id_sync, order_id)
