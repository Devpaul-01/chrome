"""add durable payment reconciliation jobs

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "r7s8t9u0v1w2"
down_revision = "q6r7s8t9u0v1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_reconciliation_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'PENDING'"), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default=sa.text("8"), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claim_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dead_lettered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("requeue_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_requeued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id"], ["payment_transactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("transaction_id", name="uq_payment_reconciliation_transaction"),
    )
    op.create_index("idx_payment_reconciliation_status_due", "payment_reconciliation_jobs", ["status", "next_attempt_at"])
    op.create_index("idx_payment_reconciliation_processing_lease", "payment_reconciliation_jobs", ["status", "claim_expires_at"])
    op.create_index("idx_payment_reconciliation_dead_lettered", "payment_reconciliation_jobs", ["status", "dead_lettered_at"])
    op.create_index("idx_payment_reconciliation_provider", "payment_reconciliation_jobs", ["provider"])


def downgrade() -> None:
    op.drop_index("idx_payment_reconciliation_provider", table_name="payment_reconciliation_jobs")
    op.drop_index("idx_payment_reconciliation_dead_lettered", table_name="payment_reconciliation_jobs")
    op.drop_index("idx_payment_reconciliation_processing_lease", table_name="payment_reconciliation_jobs")
    op.drop_index("idx_payment_reconciliation_status_due", table_name="payment_reconciliation_jobs")
    op.drop_table("payment_reconciliation_jobs")
