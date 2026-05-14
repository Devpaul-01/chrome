"""initial schema

Revision ID: 78efe19bc04e
Revises:
Create Date: 2026-02-27 20:21:32.192407

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "78efe19bc04e"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS citext;")

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("stripe_customer_id", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "metadata", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "birthday_schedules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("days_before", sa.Integer(), nullable=False),
        sa.Column(
            "enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_schedule_user_enabled",
        "birthday_schedules",
        ["user_id", "enabled"],
        unique=False,
    )
    op.create_index(
        "uniq_schedule_user_days",
        "birthday_schedules",
        ["user_id", "days_before"],
        unique=True,
    )
    op.create_table(
        "contacts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("facebook_profile_url", sa.Text(), nullable=False),
        sa.Column("birthday", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "gender",
            postgresql.ENUM("MALE", "FEMALE", "NEUTRAL", "ALL", name="gender_enum"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_contact_user_birthday", "contacts", ["user_id", "birthday"], unique=False
    )
    op.create_index(
        "idx_contact_user_gender", "contacts", ["user_id", "gender"], unique=False
    )
    op.create_table(
        "message_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "gender",
            postgresql.ENUM("MALE", "FEMALE", "NEUTRAL", "ALL", name="gender_enum"),
            nullable=False,
        ),
        sa.Column("segment_ids", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_message_group_user_gender",
        "message_groups",
        ["user_id", "gender"],
        unique=False,
    )
    op.create_table(
        "message_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("friend_name", sa.Text(), nullable=False),
        sa.Column("friend_profile_url", sa.Text(), nullable=False),
        sa.Column("birthday_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("message_content", sa.Text(), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending",
                "processing",
                "sent",
                "delivered",
                "failed",
                name="message_status_enum",
            ),
            server_default=sa.text("'sent'"),
            nullable=False,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_history_user_sent", "message_history", ["user_id", "sent_at"], unique=False
    )
    op.create_index(
        "idx_history_user_status",
        "message_history",
        ["user_id", "status"],
        unique=False,
    )
    op.create_table(
        "message_queue",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("friend_name", sa.Text(), nullable=False),
        sa.Column("friend_profile_url", sa.Text(), nullable=False),
        sa.Column("birthday_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_send_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("message_content", sa.Text(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending",
                "processing",
                "sent",
                "delivered",
                "failed",
                name="message_status_enum",
            ),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_queue_scheduled_time",
        "message_queue",
        ["scheduled_send_time"],
        unique=False,
    )
    op.create_index(
        "idx_queue_user_status", "message_queue", ["user_id", "status"], unique=False
    )
    op.create_table(
        "message_templates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("greeting", sa.Text(), nullable=False),
        sa.Column("sentiment", sa.Text(), nullable=False),
        sa.Column("closing", sa.Text(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column(
            "days_in_advance", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "gender",
            postgresql.ENUM("MALE", "FEMALE", "NEUTRAL", "ALL", name="gender_enum"),
            server_default=sa.text("'ALL'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_message_template_user", "message_templates", ["user_id"], unique=False
    )
    op.create_index(
        "idx_message_template_user_gender",
        "message_templates",
        ["user_id", "gender"],
        unique=False,
    )
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(
        "idx_reset_token_expires",
        "password_reset_tokens",
        ["token", "expires_at"],
        unique=False,
    )
    op.create_index(
        "idx_reset_user_created",
        "password_reset_tokens",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "posts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column(
            "gender",
            postgresql.ENUM("MALE", "FEMALE", "NEUTRAL", "ALL", name="gender_enum"),
            nullable=False,
        ),
        sa.Column(
            "is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column(
            "font_family", sa.Text(), server_default=sa.text("'Arial'"), nullable=True
        ),
        sa.Column(
            "font_size", sa.Integer(), server_default=sa.text("48"), nullable=True
        ),
        sa.Column(
            "font_color", sa.Text(), server_default=sa.text("'#ffffff'"), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_post_user_default", "posts", ["user_id", "is_default"], unique=False
    )
    op.create_index(
        "idx_post_user_gender", "posts", ["user_id", "gender"], unique=False
    )
    op.create_table(
        "smtp_configs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("host", sa.Text(), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password", sa.Text(), nullable=False),
        sa.Column(
            "use_tls", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("from_email", sa.Text(), nullable=False),
        sa.Column("from_name", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("idx_smtp_config_user", "smtp_configs", ["user_id"], unique=True)
    op.create_table(
        "subscription_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "ACTIVE",
                "TRIALING",
                "PAST_DUE",
                "CANCELED",
                "UNPAID",
                "INCOMPLETE",
                "INCOMPLETE_EXPIRED",
                name="subscription_status_enum",
            ),
            nullable=False,
        ),
        sa.Column("price_id", sa.String(), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(), nullable=False),
        sa.Column("stripe_customer_id", sa.String(), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "cancel_at_period_end",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "metadata", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_subscription_user", "subscription_records", ["user_id"], unique=False
    )
    op.create_index(
        "idx_subscription_user_status",
        "subscription_records",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        "uniq_active_subscription_per_user",
        "subscription_records",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )
    op.create_table(
        "template_segments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "segment_type",
            postgresql.ENUM("GREETING", "BODY", "CLOSING", name="segment_type_enum"),
            nullable=False,
        ),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_template_user_deleted",
        "template_segments",
        ["user_id", "deleted_at"],
        unique=False,
    )
    op.create_index(
        "idx_template_user_type",
        "template_segments",
        ["user_id", "segment_type"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_table(
        "user_images",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_user_image_user_created",
        "user_images",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "birthday_configs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "mode",
            postgresql.ENUM("EARLY", "ON_DAY", "BELATED", name="birthday_mode_enum"),
            nullable=False,
        ),
        sa.Column("days_offset", sa.Integer(), nullable=False),
        sa.Column("message_group_id", sa.UUID(), nullable=True),
        sa.Column("post_id", sa.UUID(), nullable=True),
        sa.Column(
            "gender_filter",
            postgresql.ENUM("MALE", "FEMALE", "NEUTRAL", "ALL", name="gender_enum"),
            nullable=False,
        ),
        sa.Column(
            "archive_enabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["message_group_id"], ["message_groups.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_birthday_config_user_enabled",
        "birthday_configs",
        ["user_id", "enabled"],
        unique=False,
    )
    op.create_index(
        "idx_birthday_config_user_mode",
        "birthday_configs",
        ["user_id", "mode"],
        unique=False,
    )
    op.create_index(
        "uniq_birthday_config_user_mode_offset",
        "birthday_configs",
        ["user_id", "mode", "days_offset"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "uniq_birthday_config_user_mode_offset", table_name="birthday_configs"
    )
    op.drop_index("idx_birthday_config_user_mode", table_name="birthday_configs")
    op.drop_index("idx_birthday_config_user_enabled", table_name="birthday_configs")
    op.drop_table("birthday_configs")
    op.drop_index("idx_user_image_user_created", table_name="user_images")
    op.drop_table("user_images")
    op.drop_index(
        "idx_template_user_type",
        table_name="template_segments",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index("idx_template_user_deleted", table_name="template_segments")
    op.drop_table("template_segments")
    op.drop_index(
        "uniq_active_subscription_per_user",
        table_name="subscription_records",
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )
    op.drop_index("idx_subscription_user_status", table_name="subscription_records")
    op.drop_index("idx_subscription_user", table_name="subscription_records")
    op.drop_table("subscription_records")
    op.drop_index("idx_smtp_config_user", table_name="smtp_configs")
    op.drop_table("smtp_configs")
    op.drop_index("idx_post_user_gender", table_name="posts")
    op.drop_index("idx_post_user_default", table_name="posts")
    op.drop_table("posts")
    op.drop_index("idx_reset_user_created", table_name="password_reset_tokens")
    op.drop_index("idx_reset_token_expires", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_index("idx_message_template_user_gender", table_name="message_templates")
    op.drop_index("idx_message_template_user", table_name="message_templates")
    op.drop_table("message_templates")
    op.drop_index("idx_queue_user_status", table_name="message_queue")
    op.drop_index("idx_queue_scheduled_time", table_name="message_queue")
    op.drop_table("message_queue")
    op.drop_index("idx_history_user_status", table_name="message_history")
    op.drop_index("idx_history_user_sent", table_name="message_history")
    op.drop_table("message_history")
    op.drop_index("idx_message_group_user_gender", table_name="message_groups")
    op.drop_table("message_groups")
    op.drop_index("idx_contact_user_gender", table_name="contacts")
    op.drop_index("idx_contact_user_birthday", table_name="contacts")
    op.drop_table("contacts")
    op.drop_index("uniq_schedule_user_days", table_name="birthday_schedules")
    op.drop_index("idx_schedule_user_enabled", table_name="birthday_schedules")
    op.drop_table("birthday_schedules")
    op.drop_table("users")
