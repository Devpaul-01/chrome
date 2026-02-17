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
    __tablename__ = "users"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(CITEXT(), nullable=False, unique=True)
    password_hash = Column(Text(), nullable=False)
    stripe_customer_id = Column(String())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    last_login_at = Column(DateTime(timezone=True))
    metadata_payload = Column("metadata", JSON(), nullable=False, server_default=text("'{}'::json"))

    subscription_records = relationship("SubscriptionRecord", back_populates="user", cascade="all, delete-orphan")
    template_segments = relationship("TemplateSegment", back_populates="user", cascade="all, delete-orphan")
    birthday_schedules = relationship("BirthdaySchedule", back_populates="user", cascade="all, delete-orphan")
    message_queue = relationship("MessageQueue", back_populates="user", cascade="all, delete-orphan")
    message_history = relationship("MessageHistory", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")


class SubscriptionRecord(Base):
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


class PasswordResetToken(Base):
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


# ========== Phase 2 Models ==========

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
    __tablename__ = "contacts"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text(), nullable=False)
    facebook_profile_url = Column(Text(), nullable=False)
    birthday = Column(DateTime(timezone=True), nullable=False)
    gender = Column(gender_enum)
    notes = Column(Text())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_contact_user_birthday", "user_id", "birthday"),
        Index("idx_contact_user_gender", "user_id", "gender"),
    )


class MessageGroup(Base):
    __tablename__ = "message_groups"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text(), nullable=False)
    gender = Column(gender_enum, nullable=False)
    segment_ids = Column(JSON(), nullable=False)  # Array of template segment IDs
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_message_group_user_gender", "user_id", "gender"),
    )


class Post(Base):
    __tablename__ = "posts"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text(), nullable=False)
    image_url = Column(Text())
    gender = Column(gender_enum, nullable=False)
    is_default = Column(Boolean(), nullable=False, server_default=text("false"))
    label = Column(Text())
    font_family = Column(Text(), server_default=text("'Arial'"))
    font_size = Column(Integer, server_default=text("48"))
    font_color = Column(Text(), server_default=text("'#ffffff'"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_post_user_gender", "user_id", "gender"),
        Index("idx_post_user_default", "user_id", "is_default"),
    )


class UserImage(Base):
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
    __tablename__ = "smtp_configs"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    host = Column(Text(), nullable=False)
    port = Column(Integer, nullable=False)
    username = Column(Text(), nullable=False)
    password = Column(Text(), nullable=False)  # Should be encrypted in production
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
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    user = relationship("User")

    __table_args__ = (
        Index("idx_message_template_user", "user_id"),
        Index("idx_message_template_user_gender", "user_id", "gender"),
    )

