"""
db/models.py — SQLAlchemy ORM models for all database tables.

Table / model mapping
---------------------
Phase 1 (core auth & messaging):
  users                   → User
  subscription_records    → SubscriptionRecord
  template_segments       → TemplateSegment     (legacy greeting/body/closing)
  birthday_schedules      → BirthdaySchedule
  message_queue           → MessageQueue
  message_history         → MessageHistory
  password_reset_tokens   → PasswordResetToken

Phase 2 (contact & automation):
  contacts                → Contact
  message_groups          → MessageGroup
  posts                   → Post               (timeline posts)
  user_images             → UserImage
  birthday_configs        → BirthdayConfig
  smtp_configs            → SMTPConfig
  message_templates       → MessageTemplate    (full greeting+sentiment+closing template)

All UUID primary keys use PostgreSQL's native ``UUID`` type.
Database-managed ENUMs (created by Alembic migrations) are referenced with
``create_type=False`` to avoid duplicate-type errors on startup.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text, text
from sqlalchemy.dialects.postgresql import CITEXT, ENUM, UUID as PG_UUID
from sqlalchemy.orm import relationship

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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(CITEXT(), nullable=False, unique=True)
    password_hash = Column(Text(), nullable=False)
    stripe_customer_id = Column(String())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    last_login_at = Column(DateTime(timezone=True))
    failed_login_count = Column(Integer, nullable=False, server_default=text("0"))
    locked_until = Column(DateTime(timezone=True))
    metadata_payload = Column("metadata", JSON(), nullable=False, server_default=text("'{}'::json"))

    subscription_records = relationship("SubscriptionRecord", back_populates="user", cascade="all, delete-orphan")
    template_segments = relationship("TemplateSegment", back_populates="user", cascade="all, delete-orphan")
    birthday_schedules = relationship("BirthdaySchedule", back_populates="user", cascade="all, delete-orphan")
    message_queue = relationship("MessageQueue", back_populates="user", cascade="all, delete-orphan")
    message_history = relationship("MessageHistory", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")
    email_verification_tokens = relationship(
        "EmailVerificationToken", back_populates="user", cascade="all, delete-orphan"
    )
    email_verified = Column(Boolean(), nullable=False, server_default=text("false"))


class SubscriptionRecord(Base):
    """
    Stripe subscription snapshot for a user.

    One record per Stripe subscription lifecycle event; the most recently
    updated record (latest ``updated_at``) is treated as the current status.
    The partial unique index ``uniq_active_subscription_per_user`` ensures
    at most one ``ACTIVE`` row per user at the database level.
    """

    __tablename__ = "subscription_records"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(subscription_status_enum, nullable=False)
    price_id = Column(String(), nullable=False)
    stripe_subscription_id = Column(String(), nullable=False)
    stripe_customer_id = Column(String(), nullable=False)
    current_period_start = Column(DateTime(timezone=True))
    current_period_end = Column(DateTime(timezone=True))
    cancel_at_period_end = Column(Boolean(), nullable=False, server_default=text("false"))
    canceled_at = Column(DateTime(timezone=True))
    trial_end = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    ended_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    metadata_payload = Column("metadata", JSON(), nullable=False, server_default=text("'{}'::json"))

    user = relationship("User", back_populates="subscription_records")

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


class TemplateSegment(Base):
    """
    Legacy three-part message template segment (GREETING / BODY / CLOSING).

    Soft-deleted via ``deleted_at`` so existing message history still
    references the original content even after the user removes a segment.
    """

    __tablename__ = "template_segments"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    segment_type = Column(segment_type_enum, nullable=False)
    label = Column(Text())
    content = Column(Text(), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))

    user = relationship("User", back_populates="template_segments")

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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    days_before = Column(Integer, nullable=False)
    enabled = Column(Boolean(), nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User", back_populates="birthday_schedules")

    __table_args__ = (
        Index("idx_schedule_user_enabled", "user_id", "enabled"),
        Index("uniq_schedule_user_days", "user_id", "days_before", unique=True),
    )


class MessageQueue(Base):
    """
    Pending outbound message waiting to be sent by the Chrome extension.

    Status lifecycle: ``pending`` → ``processing`` → ``sent`` | ``failed``.
    Failed messages may be retried (status reset to ``pending``) by the
    extension's retry endpoint.
    """

    __tablename__ = "message_queue"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    friend_name = Column(Text(), nullable=False)
    friend_profile_url = Column(Text(), nullable=False)
    birthday_date = Column(DateTime(timezone=True), nullable=False)
    scheduled_send_time = Column(DateTime(timezone=True), nullable=False)
    message_content = Column(Text(), nullable=False)
    status = Column(message_status_enum, nullable=False, server_default=text("'pending'"))
    error_message = Column(Text())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User", back_populates="message_queue")

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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    friend_name = Column(Text(), nullable=False)
    friend_profile_url = Column(Text(), nullable=False)
    birthday_date = Column(DateTime(timezone=True), nullable=False)
    message_content = Column(Text(), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    status = Column(message_status_enum, nullable=False, server_default=text("'sent'"))
    error_message = Column(Text())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User", back_populates="message_history")

    __table_args__ = (
        Index("idx_history_user_sent", "user_id", "sent_at"),
        Index("idx_history_user_status", "user_id", "status"),
    )


class UserSession(Base):
    """Persistent authenticated session anchored to the latest refresh-token JTI."""

    __tablename__ = "user_sessions"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    current_refresh_token_jti = Column(String(64), nullable=False, unique=True)
    ip_address = Column(String(64))
    user_agent = Column(Text())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    last_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    revoked_reason = Column(String(50))

    user = relationship("User", back_populates="sessions")

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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User", back_populates="password_reset_tokens")

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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    refresh_token_jti = Column(String(64), nullable=False, unique=True)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User", back_populates="email_verification_tokens")

    __table_args__ = (
        Index("idx_email_verif_token_expires", "token", "expires_at"),
        Index("idx_email_verif_user_created", "user_id", "created_at"),
    )


# ========== Phase 2 Models ==========
# Models added in Phase 2 to support the full automation and contact-management
# features.  They are created by Alembic migrations and share the same
# declarative Base as the Phase 1 models above.

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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text(), nullable=False)
    facebook_profile_url = Column(Text(), nullable=False)
    birthday = Column(DateTime(timezone=True), nullable=False)
    birthday_month_only = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    gender = Column(gender_enum)
    notes = Column(Text())
    group_id = Column(PG_UUID(as_uuid=True), ForeignKey("message_groups.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")
    group = relationship("MessageGroup")

    __table_args__ = (
        Index("idx_contact_user_birthday", "user_id", "birthday"),
        Index("idx_contact_user_gender", "user_id", "gender"),
        Index("uq_contact_user_profile_url", "user_id", "facebook_profile_url", unique=True),
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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    timestamps = Column(JSON(), nullable=False, server_default=text("'[]'::json"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_send_rate_limit_user", "user_id", unique=True),
    )


class MessageGroup(Base):
    """
    Named tag/label that can be assigned to templates, posts, and contacts
    to organise birthday messages by group (e.g. "Family", "Close Friends").
    """

    __tablename__ = "message_groups"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text(), nullable=False)
    color = Column(Text(), nullable=False, server_default=text("'#6b7280'"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_message_group_user", "user_id"),
    )


class Post(Base):
    """
    Timeline post template that can accompany a birthday DM.

    ``image_url`` may contain a Nifty Images URL with merge-tag placeholders
    (e.g. ``{{name}}``) that are resolved by the extension before posting.
    Font columns (``font_family``, ``font_size``, ``font_color``) control the
    text overlay when the extension composites the image on a canvas.
    """

    __tablename__ = "posts"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text(), nullable=False)
    image_url = Column(Text())
    gender = Column(gender_enum, nullable=False)
    is_default = Column(Boolean(), nullable=False, server_default=text("false"))
    label = Column(Text())
    group_id = Column(PG_UUID(as_uuid=True), ForeignKey("message_groups.id", ondelete="SET NULL"))
    font_family = Column(Text(), server_default=text("'Arial'"))
    font_size = Column(Integer, server_default=text("48"))
    font_color = Column(Text(), server_default=text("'#ffffff'"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")
    group = relationship("MessageGroup")

    __table_args__ = (
        Index("idx_post_user_gender", "user_id", "gender"),
        Index("idx_post_user_default", "user_id", "is_default"),
        Index("idx_post_group", "group_id"),
        Index("uq_post_user_label", "user_id", "label", unique=True, postgresql_where=text("label IS NOT NULL")),
    )


class UserImage(Base):
    """Image asset uploaded by the user and stored in the image library."""

    __tablename__ = "user_images"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    url = Column(Text(), nullable=False)
    filename = Column(Text(), nullable=False)
    size = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_user_image_user_created", "user_id", "created_at"),
    )


class BirthdayConfig(Base):
    """
    Automation rule that ties a mode (EARLY / ON_DAY / BELATED), a day offset,
    an optional message group, an optional post, and a gender filter together.

    The unique index ``uniq_birthday_config_user_mode_offset`` prevents
    duplicate rules for the same user / mode / offset combination.
    """

    __tablename__ = "birthday_configs"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mode = Column(birthday_mode_enum, nullable=False)
    days_offset = Column(Integer, nullable=False)
    message_group_id = Column(PG_UUID(as_uuid=True), ForeignKey("message_groups.id", ondelete="CASCADE"))
    post_id = Column(PG_UUID(as_uuid=True), ForeignKey("posts.id", ondelete="SET NULL"))
    gender_filter = Column(gender_enum, nullable=False)
    archive_enabled = Column(Boolean(), nullable=False, server_default=text("false"))
    enabled = Column(Boolean(), nullable=False, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")
    message_group = relationship("MessageGroup")
    post = relationship("Post")

    __table_args__ = (
        Index("idx_birthday_config_user_mode", "user_id", "mode"),
        Index("idx_birthday_config_user_enabled", "user_id", "enabled"),
        Index("uniq_birthday_config_user_mode_offset", "user_id", "mode", "days_offset", unique=True),
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

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    host = Column(Text(), nullable=False)
    port = Column(Integer, nullable=False)
    username = Column(Text(), nullable=False)
    password = Column(Text(), nullable=False)  # Fernet-encrypted at rest (see core/encryption.py)
    use_tls = Column(Boolean(), nullable=False, server_default=text("true"))
    from_email = Column(Text(), nullable=False)
    from_name = Column(Text())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_smtp_config_user", "user_id", unique=True),
    )


class MessageTemplate(Base):
    """Complete message templates with greeting, body, closing, and image"""
    __tablename__ = "message_templates"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(Text(), nullable=False)
    greeting = Column(Text(), nullable=False)
    sentiment = Column(Text(), nullable=False)  # Main body/message
    closing = Column(Text(), nullable=False)
    image_url = Column(Text())  # Optional image URL
    days_in_advance = Column(Integer, nullable=False, server_default=text("0"))
    gender = Column(gender_enum, nullable=False, server_default=text("'ALL'"))
    group_id = Column(PG_UUID(as_uuid=True), ForeignKey("message_groups.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")
    group = relationship("MessageGroup")

    __table_args__ = (
        Index("idx_message_template_user", "user_id"),
        Index("idx_message_template_user_gender", "user_id", "gender"),
        Index("idx_message_template_group", "group_id"),
        Index("uq_message_template_user_title", "user_id", "title", unique=True),
    )

