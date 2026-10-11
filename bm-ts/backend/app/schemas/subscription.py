"""
schemas/subscription.py — Pydantic schemas for subscription status and Stripe checkout.

  SubscriptionStatusResponse  — GET  /subscription/status response
  CheckoutSessionRequest      — POST /subscription/create-checkout-session body
  CheckoutSessionResponse     — POST /subscription/create-checkout-session response
  ChangePlanRequest           — POST /subscription/change-plan body
  ChangePlanResponse          — POST /subscription/change-plan response
  CancelSubscriptionResponse  — POST /subscription/cancel response
  BillingPortalResponse       — POST /subscription/billing-portal response
  StripeWebhookResponse       — generic webhook acknowledgement response
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, HttpUrl, Field


class SubscriptionStatusResponse(BaseModel):
    is_active: bool
    plan: Optional[str]
    status: Optional[str] = None
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool = False
    canceled_at: Optional[datetime] = None
    in_grace_period: bool = False
    stripe_customer_id: Optional[str]
    stripe_subscription_id: Optional[str]
    billing_provider: Optional[str] = None
    provider_subscription_id: Optional[str] = None
    auto_renew: bool = False
    next_billing_at: Optional[datetime] = None


class CheckoutSessionRequest(BaseModel):
    plan: Literal["monthly", "yearly"]
    success_url: HttpUrl
    cancel_url: HttpUrl


class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class ChangePlanRequest(BaseModel):
    new_plan: Literal["monthly", "yearly"]


class ChangePlanResponse(BaseModel):
    status: str
    new_plan: str
    message: str


class CancelSubscriptionResponse(BaseModel):
    status: str
    cancel_at_period_end: bool
    current_period_end: Optional[datetime]
    message: str


class BillingPortalResponse(BaseModel):
    portal_url: str


class StripeWebhookResponse(BaseModel):
    message: str
    received: bool = Field(default=True)
