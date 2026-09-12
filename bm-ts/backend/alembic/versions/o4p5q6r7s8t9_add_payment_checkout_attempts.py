"""add durable payment checkout attempts

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-08-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "o4p5q6r7s8t9"
down_revision = "n3o4p5q6r7s8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_checkout_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("plan_code", sa.String(length=100), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=12), nullable=False),
        sa.Column("provider_order_id", sa.String(length=255), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=255), nullable=True),
        sa.Column("checkout_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'claimed'"), nullable=False),
        sa.Column("failure_code", sa.String(length=64), nullable=True),
        sa.Column("claim_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "uq_payment_checkout_provider_user_key",
        "payment_checkout_attempts",
        ["provider", "user_id", "idempotency_key"],
        unique=True,
    )
    op.create_index(
        "uq_payment_checkout_provider_order",
        "payment_checkout_attempts",
        ["provider", "provider_order_id"],
        unique=True,
    )
    op.create_index(
        "idx_payment_checkout_status",
        "payment_checkout_attempts",
        ["status"],
        unique=False,
    )
    op.create_index(
        "idx_payment_checkout_claim_expiry",
        "payment_checkout_attempts",
        ["status", "claim_expires_at"],
        unique=False,
    )

    op.add_column(
        "payment_transactions",
        sa.Column("checkout_attempt_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_payment_transaction_checkout_attempt",
        "payment_transactions",
        "payment_checkout_attempts",
        ["checkout_attempt_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_payment_transaction_checkout_attempt",
        "payment_transactions",
        ["checkout_attempt_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_payment_transaction_checkout_attempt",
        "payment_transactions",
        type_="unique",
    )
    op.drop_constraint(
        "fk_payment_transaction_checkout_attempt",
        "payment_transactions",
        type_="foreignkey",
    )
    op.drop_column("payment_transactions", "checkout_attempt_id")

    op.drop_index("idx_payment_checkout_claim_expiry", table_name="payment_checkout_attempts")
    op.drop_index("idx_payment_checkout_status", table_name="payment_checkout_attempts")
    op.drop_index("uq_payment_checkout_provider_order", table_name="payment_checkout_attempts")
    op.drop_index("uq_payment_checkout_provider_user_key", table_name="payment_checkout_attempts")
    op.drop_table("payment_checkout_attempts")
