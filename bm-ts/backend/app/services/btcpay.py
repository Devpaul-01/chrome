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
) -> dict[str, Any]:
    """Create a BTCPay invoice without blocking FastAPI's event loop."""
    metadata: dict[str, Any] = {
        "orderId": order_id,
        "itemDesc": description,
        "birthdayMessagingUserId": user_id,
    }

    if buyer_email:
        metadata["buyerEmail"] = buyer_email

    payload: dict[str, Any] = {
        "amount": format(amount, "f"),
        "currency": currency.upper(),
        "metadata": metadata,
    }

    return await run_in_threadpool(_create_invoice_sync, payload)
