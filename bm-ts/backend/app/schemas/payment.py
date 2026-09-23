"""Schemas for BirthdayMessaging payment endpoints."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel
from typing import Literal


class BTCPayTestInvoiceResponse(BaseModel):
    """Safe subset of invoice data returned to an authenticated client."""

    payment_id: str
    provider: str
    provider_payment_id: str
    status: str
    checkout_url: str
    amount: Decimal
    currency: str
    plan_code: str

class BTCPayCheckoutRequest(BaseModel):
    """Client selects a plan code only; the backend owns all pricing."""

    plan_code: str
    payment_method: Literal["bitcoin", "monero"] = "bitcoin"


class BTCPayCheckoutResponse(BaseModel):
    """Safe checkout data returned to an authenticated client."""

    checkout_attempt_id: str
    payment_id: str
    provider: str
    provider_payment_id: str
    provider_order_id: str
    status: str
    checkout_url: str
    amount: Decimal
    currency: str
    plan_code: str
    billing_term_months: int
    reused: bool = False

class BTCPayCheckoutStatusResponse(BaseModel):
    """Authenticated status view for one durable BTCPay checkout."""

    checkout_attempt_id: str
    provider: str
    provider_order_id: str
    provider_payment_id: str | None = None
    payment_id: str | None = None
    checkout_url: str | None = None
    checkout_status: str
    payment_status: str | None = None
    amount: Decimal
    currency: str
    plan_code: str
    billing_term_months: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    recoverable: bool

class RapydCheckoutRequest(BaseModel):
    # Client selects only a plan; BirthdayMessaging owns price and currency.
    plan_code: str
