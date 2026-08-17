"""Schemas for BirthdayMessaging payment endpoints."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


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
