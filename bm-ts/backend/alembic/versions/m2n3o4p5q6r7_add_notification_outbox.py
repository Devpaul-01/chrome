"""add durable notification outbox

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m2n3o4p5q6r7"
down_revision = "l1m2n3o4p5q6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entitlement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_transaction_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("notification_type", sa.String(length=64), nullable=False),
        sa.Column("channel", sa.String(length=32), server_default="email", nullable=False),
        sa.Column("recipient", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="PENDING", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="5", nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("metadata", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["entitlement_id"], ["access_entitlements.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_transaction_id"], ["payment_transactions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index(
        "idx_notification_outbox_status_due",
        "notification_outbox",
        ["status", "scheduled_for", "next_attempt_at"],
    )
    op.create_index(
        "idx_notification_outbox_user_created",
        "notification_outbox",
        ["user_id", "created_at"],
    )
    op.create_index(
        "idx_notification_outbox_user_type",
        "notification_outbox",
        ["user_id", "notification_type"],
    )
    op.create_index(
        "idx_notification_outbox_entitlement",
        "notification_outbox",
        ["entitlement_id"],
    )
    op.create_index(
        "idx_notification_outbox_transaction",
        "notification_outbox",
        ["source_transaction_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_notification_outbox_transaction", table_name="notification_outbox")
    op.drop_index("idx_notification_outbox_entitlement", table_name="notification_outbox")
    op.drop_index("idx_notification_outbox_user_type", table_name="notification_outbox")
    op.drop_index("idx_notification_outbox_user_created", table_name="notification_outbox")
    op.drop_index("idx_notification_outbox_status_due", table_name="notification_outbox")
    op.drop_table("notification_outbox")
