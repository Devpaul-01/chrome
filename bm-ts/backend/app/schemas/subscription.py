from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, HttpUrl, Field


class SubscriptionStatusResponse(BaseModel):
    is_active: bool
    plan: Optional[str]
    current_period_end: Optional[datetime]
    stripe_customer_id: Optional[str]
    stripe_subscription_id: Optional[str]


class CheckoutSessionRequest(BaseModel):
    plan: Literal["monthly", "yearly"]
    success_url: HttpUrl
    cancel_url: HttpUrl


class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class StripeWebhookResponse(BaseModel):
    message: str
    received: bool = Field(default=True)
