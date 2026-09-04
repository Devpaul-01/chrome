"""harden notification delivery lifecycle

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
"""
from alembic import op
import sqlalchemy as sa

revision = "n3o4p5q6r7s8"
down_revision = "m2n3o4p5q6r7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notification_outbox", sa.Column("delivery_attempt_id", sa.String(length=36), nullable=True))
    op.add_column("notification_outbox", sa.Column("last_error_code", sa.String(length=64), nullable=True))
    op.add_column("notification_outbox", sa.Column("last_delivery_latency_ms", sa.Integer(), nullable=True))
    op.add_column("notification_outbox", sa.Column("claim_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("notification_outbox", sa.Column("dead_lettered_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("notification_outbox", sa.Column("requeue_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("notification_outbox", sa.Column("last_requeued_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("idx_notification_outbox_processing_lease", "notification_outbox", ["status", "claim_expires_at"])
    op.create_index("idx_notification_outbox_dead_lettered", "notification_outbox", ["status", "dead_lettered_at"])


def downgrade() -> None:
    op.drop_index("idx_notification_outbox_dead_lettered", table_name="notification_outbox")
    op.drop_index("idx_notification_outbox_processing_lease", table_name="notification_outbox")
    op.drop_column("notification_outbox", "last_requeued_at")
    op.drop_column("notification_outbox", "requeue_count")
    op.drop_column("notification_outbox", "dead_lettered_at")
    op.drop_column("notification_outbox", "claim_expires_at")
    op.drop_column("notification_outbox", "last_delivery_latency_ms")
    op.drop_column("notification_outbox", "last_error_code")
    op.drop_column("notification_outbox", "delivery_attempt_id")
