"""
db/models.py Ã¢â‚¬â€ SQLAlchemy ORM models for all database tables.

Table / model mapping
---------------------
Core auth & messaging:
  users                   Ã¢â€ â€™ User
  subscription_records    Ã¢â€ â€™ SubscriptionRecord
  payment_transactions    Ã¢â€ â€™ PaymentTransaction
  payment_webhook_events  Ã¢â€ â€™ PaymentWebhookEvent
  access_entitlements     Ã¢â€ â€™ AccessEntitlement
  template_segments       Ã¢â€ â€™ TemplateSegment     (legacy greeting/body/closing)
  birthday_schedules      Ã¢â€ â€™ BirthdaySchedule
  message_queue           Ã¢â€ â€™ MessageQueue
  message_history         Ã¢â€ â€™ MessageHistory
  password_reset_tokens   Ã¢â€ â€™ PasswordResetToken

Automation & contact management:
  contacts                Ã¢â€ â€™ Contact
  message_groups          Ã¢â€ â€™ MessageGroup
  posts                   Ã¢â€ â€™ Post               (timeline posts)
  user_images             Ã¢â€ â€™ UserImage
  birthday_configs        Ã¢â€ â€™ BirthdayConfig
  smtp_configs            Ã¢â€ â€™ SMTPConfig
  message_templates       Ã¢â€ â€™ MessageTemplate    (full greeting+sentiment+closing template)

All UUID primary keys use PostgreSQL's native ``UUID`` type.
Database-managed ENUMs (created by Alembic migrations) are referenced with
``create_type=False`` to avoid duplicate-type errors on startup.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, ENUM, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

segment_type_enum = ENUM(
    "GREETING",
    "BODY",
    "CLOSING",
    name="segment_type_enum",
    create_type=False,
)

message_status_enum = ENUM(
    "pending",
    "processing",
    "sent",
    "delivered",
    "failed",
    name="message_status_enum",
    create_type=False,
)

subscription_status_enum = ENUM(
    "ACTIVE",
    "TRIALING",
    "PAST_DUE",
    "CANCELED",
    "UNPAID",
    "INCOMPLETE",
    "INCOMPLETE_EXPIRED",
    name="subscription_status_enum",
    create_type=False,
)


class User(Base):
    """
    Core user account record.

    ``metadata_payload`` is a free-form JSON column reserved for future
    per-user configuration without requiring schema migrations.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(CITEXT(), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text(), nullable=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failed_login_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    metadata_payload: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON(), nullable=False, server_default=text("'{}'::json")
    )

    subscription_records: Mapped[list[SubscriptionRecord]] = relationship(
        "SubscriptionRecord", back_populates="user", cascade="all, delete-orphan"
    )
    payment_transactions: Mapped[list[PaymentTransaction]] = relationship(
        "PaymentTransaction", back_populates="user", cascade="all, delete-orphan"
    )
    access_entitlements: Mapped[list[AccessEntitlement]] = relationship(
        "AccessEntitlement", back_populates="user", cascade="all, delete-orphan"
    )
    template_segments: Mapped[list[TemplateSegment]] = relationship(
        "TemplateSegment", back_populates="user", cascade="all, delete-orphan"
    )
    birthday_schedules: Mapped[list[BirthdaySchedule]] = relationship(
        "BirthdaySchedule", back_populates="user", cascade="all, delete-orphan"
    )
    message_queue: Mapped[list[MessageQueue]] = relationship(
        "MessageQueue", back_populates="user", cascade="all, delete-orphan"
    )
    message_history: Mapped[list[MessageHistory]] = relationship(
        "MessageHistory", back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list[UserSession]] = relationship(
        "UserSession", back_populates="user", cascade="all, delete-orphan"
    )
    password_reset_tokens: Mapped[list[PasswordResetToken]] = relationship(
        "PasswordResetToken", back_populates="user", cascade="all, delete-orphan"
    )
    email_verification_tokens: Mapped[list[EmailVerificationToken]] = relationship(
        "EmailVerificationToken", back_populates="user", cascade="all, delete-orphan"
    )
    email_verified: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )


class SubscriptionRecord(Base):
    """
    Stripe subscription snapshot for a user.

    One record per Stripe subscription lifecycle event; the most recently
    updated record (latest ``updated_at``) is treated as the current status.
    The partial unique index ``uniq_active_subscription_per_user`` ensures
    at most one ``ACTIVE`` row per user at the database level.
    """

    __tablename__ = "subscription_records"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(subscription_status_enum, nullable=False)
    price_id: Mapped[str] = mapped_column(String(), nullable=False)
    stripe_subscription_id: Mapped[str] = mapped_column(String(), nullable=False)
    stripe_customer_id: Mapped[str] = mapped_column(String(), nullable=False)
    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    canceled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    trial_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    metadata_payload: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON(), nullable=False, server_default=text("'{}'::json")
    )

    user: Mapped[User] = relationship("User", back_populates="subscription_records")

    __table_args__ = (
        Index("idx_subscription_user", "user_id"),
        Index("idx_subscription_user_status", "user_id", "status"),
        Index(
            "uniq_active_subscription_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )


class PaymentCheckoutAttempt(Base):
    """Durable server-owned idempotency record for external payment checkout.

    The row is committed before BirthdayMessaging calls BTCPay. A deterministic
    provider_order_id lets a later request reconcile a provider invoice if the
    application crashes after BTCPay creates it but before the local transaction
    is finalized.
    """

    __tablename__ = "payment_checkout_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    plan_code: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(12), nullable=False)
    provider_order_id: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    checkout_url: Mapped[str | None] = mapped_column(Text(), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'claimed'")
    )
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    claim_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    metadata_payload: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON(), nullable=False, server_default=text("'{}'::json")
    )

    __table_args__ = (
        Index(
            "uq_payment_checkout_provider_user_key",
            "provider",
            "user_id",
            "idempotency_key",
            unique=True,
        ),
        Index(
            "uq_payment_checkout_provider_order",
            "provider",
            "provider_order_id",
            unique=True,
        ),
        Index("idx_payment_checkout_status", "status"),
        Index("idx_payment_checkout_claim_expiry", "status", "claim_expires_at"),
    )

class PaymentTransaction(Base):
    """
    Provider-neutral payment ledger for Stripe, BTCPay, Rapyd, and future providers.

    A row is created when BirthdayMessaging creates or learns about a payment
    attempt. ``provider_payment_id`` stores the provider's primary external
    identifier (for BTCPay this is the invoice ID). Provider-specific response
    data may be retained in ``metadata_payload`` without requiring a schema
    change.

    This model is intentionally additive and does not replace the existing
    Stripe-specific ``SubscriptionRecord`` model.
    """

    __tablename__ = "payment_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_order_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    checkout_attempt_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("payment_checkout_attempts.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    checkout_url: Mapped[str | None] = mapped_column(Text(), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(64), nullable=True)
    plan_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    metadata_payload: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON(), nullable=False, server_default=text("'{}'::json")
    )

    user: Mapped[User] = relationship("User", back_populates="payment_transactions")

    __table_args__ = (
        Index("idx_payment_transaction_user", "user_id"),
        Index("idx_payment_transaction_user_status", "user_id", "status"),
        Index("idx_payment_transaction_provider", "provider"),
        Index("idx_payment_transaction_provider_order", "provider", "provider_order_id"),
        Index(
            "uq_payment_transaction_provider_payment",
            "provider",
            "provider_payment_id",
            unique=True,
        ),
    )


class PaymentWebhookEvent(Base):
    """
    Provider-neutral record of a logical payment webhook event.

    For BTCPay:
    - provider_event_id stores originalDeliveryId, which remains stable
      across webhook redeliveries and acts as the idempotency key.
    - provider_delivery_id stores deliveryId for the delivery attempt.
    - provider_payment_id stores the BTCPay invoiceId.

    The unique provider/event index prevents the same logical event from
    executing payment or subscription side effects more than once.
    """

    __tablename__ = "payment_webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_delivery_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    provider_payment_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    is_redelivery: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    processing_status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'received'")
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON(), nullable=False, server_default=text("'{}'::json")
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_error: Mapped[str | None] = mapped_column(Text(), nullable=True)

    __table_args__ = (
        Index(
            "uq_payment_webhook_event_provider_event",
            "provider",
            "provider_event_id",
            unique=True,
        ),
        Index(
            "idx_payment_webhook_event_provider_payment",
            "provider",
            "provider_payment_id",
        ),
        Index(
            "idx_payment_webhook_event_status",
            "processing_status",
        ),
    )


class AccessEntitlement(Base):
    """Provider-neutral application-access grant created from authoritative billing truth."""

    __tablename__ = "access_entitlements"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    plan_code: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'ACTIVE'")
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_provider: Mapped[str] = mapped_column(String(32), nullable=False)
    source_payment_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("payment_transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    metadata_payload: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON(), nullable=False, server_default=text("'{}'::json")
    )

    user: Mapped[User] = relationship("User", back_populates="access_entitlements")
    source_transaction: Mapped[PaymentTransaction | None] = relationship("PaymentTransaction")

    __table_args__ = (
        Index("idx_access_entitlement_user", "user_id"),
        Index("idx_access_entitlement_user_status_expiry", "user_id", "status", "expires_at"),
        Index("idx_access_entitlement_expires", "expires_at"),
        Index(
            "uq_access_entitlement_provider_payment",
            "source_provider",
            "source_payment_id",
            unique=True,
        ),
        Index(
            "uq_access_entitlement_source_transaction",
            "source_transaction_id",
            unique=True,
            postgresql_where=text("source_transaction_id IS NOT NULL"),
        ),
    )


class TemplateSegment(Base):
    """
    Legacy three-part message template segment (GREETING / BODY / CLOSING).

    Soft-deleted via ``deleted_at`` so existing message history still
    references the original content even after the user removes a segment.
    """

    __tablename__ = "template_segments"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    segment_type: Mapped[str] = mapped_column(segment_type_enum, nullable=False)
    label: Mapped[str | None] = mapped_column(Text(), nullable=True)
    content: Mapped[str] = mapped_column(Text(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship("User", back_populates="template_segments")

    __table_args__ = (
        Index(
            "idx_template_user_type",
            "user_id",
            "segment_type",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("idx_template_user_deleted", "user_id", "deleted_at"),
    )


class BirthdaySchedule(Base):
    """
    Per-user rule for sending advance/follow-up messages.

    ``days_before`` is the number of days before (positive) or after
    (negative) a contact's birthday on which to send the message.
    The unique index prevents duplicate offsets for the same user.
    """

    __tablename__ = "birthday_schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    days_before: Mapped[int] = mapped_column(Integer, nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User", back_populates="birthday_schedules")

    __table_args__ = (
        Index("idx_schedule_user_enabled", "user_id", "enabled"),
        Index("uniq_schedule_user_days", "user_id", "days_before", unique=True),
    )


class MessageQueue(Base):
    """
    Pending outbound message waiting to be sent by the Chrome extension.

    Status lifecycle: ``pending`` Ã¢â€ â€™ ``processing`` Ã¢â€ â€™ ``sent`` | ``failed``.
    Failed messages may be retried (status reset to ``pending``) by the
    extension's retry endpoint.
    """

    __tablename__ = "message_queue"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    friend_name: Mapped[str] = mapped_column(Text(), nullable=False)
    friend_profile_url: Mapped[str] = mapped_column(Text(), nullable=False)
    birthday_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    scheduled_send_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    message_content: Mapped[str] = mapped_column(Text(), nullable=False)
    status: Mapped[str] = mapped_column(
        message_status_enum, nullable=False, server_default=text("'pending'")
    )
    error_message: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User", back_populates="message_queue")

    __table_args__ = (
        Index("idx_queue_user_status", "user_id", "status"),
        Index("idx_queue_scheduled_time", "scheduled_send_time"),
    )


class MessageHistory(Base):
    """
    Immutable audit log of every message that was attempted, delivered, or failed.

    Records are never updated in place; a new row is appended for each send attempt.
    """

    __tablename__ = "message_history"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    friend_name: Mapped[str] = mapped_column(Text(), nullable=False)
    friend_profile_url: Mapped[str] = mapped_column(Text(), nullable=False)
    birthday_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    message_content: Mapped[str] = mapped_column(Text(), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    status: Mapped[str] = mapped_column(
        message_status_enum, nullable=False, server_default=text("'sent'")
    )
    error_message: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User", back_populates="message_history")

    __table_args__ = (
        Index("idx_history_user_sent", "user_id", "sent_at"),
        Index("idx_history_user_status", "user_id", "status"),
    )


class UserSession(Base):
    """Persistent authenticated session anchored to the latest refresh-token JTI."""

    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    current_refresh_token_jti: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="sessions")

    __table_args__ = (
        Index("idx_user_sessions_user_last_seen", "user_id", "last_seen_at"),
        Index("idx_user_sessions_user_revoked", "user_id", "revoked_at"),
        Index("idx_user_sessions_expires", "expires_at"),
    )


class PasswordResetToken(Base):
    """
    Single-use password reset token emailed to the user.

    ``used_at`` is set when the token is consumed so it cannot be replayed.
    Tokens also have a hard expiry (``expires_at``) enforced at the
    application level.
    """

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User", back_populates="password_reset_tokens")

    __table_args__ = (
        Index("idx_reset_token_expires", "token", "expires_at"),
        Index("idx_reset_user_created", "user_id", "created_at"),
    )


class RevokedToken(Base):
    """Records revoked refresh-token JTIs so refresh tokens can be individually invalidated.

    Each row stores the JTI, owning user, and the token expiry so rows may be
    cleaned up after expiration.
    """

    __tablename__ = "revoked_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    refresh_token_jti: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("idx_revoked_jti", "refresh_token_jti", unique=True),
        Index("idx_revoked_expires", "expires_at"),
    )


class EmailVerificationToken(Base):
    """
    Single-use email verification token emailed to the user.

    Mirrors the password reset token model but used to verify user email addresses.
    """

    __tablename__ = "email_verification_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship(
        "User", back_populates="email_verification_tokens"
    )

    __table_args__ = (
        Index("idx_email_verif_token_expires", "token", "expires_at"),
        Index("idx_email_verif_user_created", "user_id", "created_at"),
    )


# ========== Automation & Contact Management Models ==========
# The following models support full automation and contact management.
# They are created by Alembic migrations and share the same declarative Base.

gender_enum = ENUM(
    "MALE",
    "FEMALE",
    "NEUTRAL",
    "ALL",
    name="gender_enum",
    create_type=False,
)

birthday_mode_enum = ENUM(
    "EARLY",
    "ON_DAY",
    "BELATED",
    name="birthday_mode_enum",
    create_type=False,
)


class Contact(Base):
    """
    A Facebook friend stored by the user for birthday automation.

    ``birthday`` is stored as a timezone-aware datetime; only the month/day
    (and optionally year) portion is meaningful.  ``gender`` drives
    pronoun/template selection during automation runs.
    """

    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    facebook_profile_url: Mapped[str] = mapped_column(Text(), nullable=False)
    birthday: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    birthday_month_only: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    gender: Mapped[str | None] = mapped_column(gender_enum, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text(), nullable=True)
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("message_groups.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")
    group: Mapped[MessageGroup | None] = relationship("MessageGroup")

    __table_args__ = (
        Index("idx_contact_user_birthday", "user_id", "birthday"),
        Index("idx_contact_user_gender", "user_id", "gender"),
        Index(
            "uq_contact_user_profile_url",
            "user_id",
            "facebook_profile_url",
            unique=True,
        ),
        Index("idx_contact_group", "group_id"),
    )


class SendRateLimit(Base):
    """
    Server-side record of message-send timestamps for rate-limit enforcement.

    One row per user, holding a JSON array of ISO-8601 timestamps pruned to a
    7-day rolling window.  The backend enforces hourly/daily/weekly caps so that
    clearing browser storage cannot bypass limits.
    """

    __tablename__ = "send_rate_limits"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    timestamps: Mapped[list[str]] = mapped_column(
        JSON(), nullable=False, server_default=text("'[]'::json")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")

    __table_args__ = (Index("idx_send_rate_limit_user", "user_id", unique=True),)


class MessageGroup(Base):
    """
    Named tag/label that can be assigned to templates, posts, and contacts
    to organise birthday messages by group (e.g. "Family", "Close Friends").
    """

    __tablename__ = "message_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    color: Mapped[str] = mapped_column(
        Text(), nullable=False, server_default=text("'#6b7280'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")

    __table_args__ = (Index("idx_message_group_user", "user_id"),)


class Post(Base):
    """
    Timeline post template that can accompany a birthday DM.

    ``image_url`` may contain a Nifty Images URL with merge-tag placeholders
    (e.g. ``{{name}}``) that are resolved by the extension before posting.
    Font columns (``font_family``, ``font_size``, ``font_color``) control the
    text overlay when the extension composites the image on a canvas.
    """

    __tablename__ = "posts"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text(), nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text(), nullable=True)
    gender: Mapped[str] = mapped_column(gender_enum, nullable=False)
    is_default: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    label: Mapped[str | None] = mapped_column(Text(), nullable=True)
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("message_groups.id", ondelete="SET NULL"),
        nullable=True,
    )
    font_family: Mapped[str | None] = mapped_column(
        Text(), nullable=True, server_default=text("'Arial'")
    )
    font_size: Mapped[int | None] = mapped_column(
        Integer, nullable=True, server_default=text("48")
    )
    font_color: Mapped[str | None] = mapped_column(
        Text(), nullable=True, server_default=text("'#ffffff'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")
    group: Mapped[MessageGroup | None] = relationship("MessageGroup")

    __table_args__ = (
        Index("idx_post_user_gender", "user_id", "gender"),
        Index("idx_post_user_default", "user_id", "is_default"),
        Index("idx_post_group", "group_id"),
        Index(
            "uq_post_user_label",
            "user_id",
            "label",
            unique=True,
            postgresql_where=text("label IS NOT NULL"),
        ),
    )


class UserImage(Base):
    """Image asset uploaded by the user and stored in the image library."""

    __tablename__ = "user_images"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(Text(), nullable=False)
    filename: Mapped[str] = mapped_column(Text(), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="library"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")

    __table_args__ = (
        Index("idx_user_image_user_created", "user_id", "created_at"),
        Index("idx_user_image_source", "user_id", "source"),
    )


class BirthdayConfig(Base):
    """
    Automation rule that ties a mode (EARLY / ON_DAY / BELATED), a day offset,
    an optional message group, an optional post, and a gender filter together.

    The unique index ``uniq_birthday_config_user_mode_offset`` prevents
    duplicate rules for the same user / mode / offset combination.
    """

    __tablename__ = "birthday_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    mode: Mapped[str] = mapped_column(birthday_mode_enum, nullable=False)
    days_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    message_group_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("message_groups.id", ondelete="CASCADE"),
        nullable=True,
    )
    post_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("posts.id", ondelete="SET NULL"),
        nullable=True,
    )
    gender_filter: Mapped[str] = mapped_column(gender_enum, nullable=False)
    archive_enabled: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")
    message_group: Mapped[MessageGroup | None] = relationship("MessageGroup")
    post: Mapped[Post | None] = relationship("Post")

    __table_args__ = (
        Index("idx_birthday_config_user_mode", "user_id", "mode"),
        Index("idx_birthday_config_user_enabled", "user_id", "enabled"),
        Index(
            "uniq_birthday_config_user_mode_offset",
            "user_id",
            "mode",
            "days_offset",
            unique=True,
        ),
    )


class SMTPConfig(Base):
    """
    Per-user SMTP configuration for outbound email notifications.

    Exactly one row per user (enforced by a unique constraint on ``user_id``).
    The ``password`` field is encrypted at rest using Fernet symmetric
    encryption (see ``core/encryption.py``).  The SMTP router calls
    ``encrypt_value()`` before writing and never returns the real password
    via the API (responses use a masked placeholder).
    """

    __tablename__ = "smtp_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    host: Mapped[str] = mapped_column(Text(), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    username: Mapped[str] = mapped_column(Text(), nullable=False)
    password: Mapped[str] = mapped_column(
        Text(), nullable=False
    )  # Fernet-encrypted at rest (see core/encryption.py)
    use_tls: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("true")
    )
    from_email: Mapped[str] = mapped_column(Text(), nullable=False)
    from_name: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")

    __table_args__ = (Index("idx_smtp_config_user", "user_id", unique=True),)


class MessageTemplate(Base):
    """Complete message templates with greeting, body, closing, and image"""

    __tablename__ = "message_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text(), nullable=False)
    greeting: Mapped[str] = mapped_column(Text(), nullable=False)
    sentiment: Mapped[str] = mapped_column(Text(), nullable=False)  # Main body/message
    closing: Mapped[str] = mapped_column(Text(), nullable=False)
    image_url: Mapped[str | None] = mapped_column(
        Text(), nullable=True
    )  # Optional image URL
    days_in_advance: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    gender: Mapped[str] = mapped_column(
        gender_enum, nullable=False, server_default=text("'ALL'")
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("message_groups.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")
    group: Mapped[MessageGroup | None] = relationship("MessageGroup")

    __table_args__ = (
        Index("idx_message_template_user", "user_id"),
        Index("idx_message_template_user_gender", "user_id", "gender"),
        Index("idx_message_template_group", "group_id"),
        Index("uq_message_template_user_title", "user_id", "title", unique=True),
    )

class NotificationOutbox(Base):
    """Durable transactional outbox for subscription and access notifications."""

    __tablename__ = "notification_outbox"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    entitlement_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("access_entitlements.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("payment_transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    notification_type: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'email'")
    )
    recipient: Mapped[str] = mapped_column(Text(), nullable=False)
    subject: Mapped[str] = mapped_column(Text(), nullable=False)
    body_text: Mapped[str] = mapped_column(Text(), nullable=False, server_default=text("''"))
    body_html: Mapped[str] = mapped_column(Text(), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'PENDING'")
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    max_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("5")
    )
    scheduled_for: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    last_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text(), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    delivery_attempt_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_delivery_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    claim_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dead_lettered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requeue_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_requeued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_payload: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON(), nullable=False, server_default=text("'{}'::json")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped[User] = relationship("User")
    entitlement: Mapped[AccessEntitlement | None] = relationship("AccessEntitlement")
    source_transaction: Mapped[PaymentTransaction | None] = relationship("PaymentTransaction")

    __table_args__ = (
        Index("idx_notification_outbox_status_due", "status", "scheduled_for", "next_attempt_at"),
        Index("idx_notification_outbox_user_created", "user_id", "created_at"),
        Index("idx_notification_outbox_user_type", "user_id", "notification_type"),
        Index("idx_notification_outbox_entitlement", "entitlement_id"),
        Index("idx_notification_outbox_transaction", "source_transaction_id"),
        Index("idx_notification_outbox_processing_lease", "status", "claim_expires_at"),
        Index("idx_notification_outbox_dead_lettered", "status", "dead_lettered_at"),
    )
