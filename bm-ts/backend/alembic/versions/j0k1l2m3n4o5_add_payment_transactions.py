"""add payment transactions

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-08-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "j0k1l2m3n4o5"
down_revision: Union[str, Sequence[str], None] = "i9j0k1l2m3n4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=255), nullable=True),
        sa.Column("provider_order_id", sa.String(length=255), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=12), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("checkout_url", sa.Text(), nullable=True),
        sa.Column("payment_method", sa.String(length=64), nullable=True),
        sa.Column("plan_code", sa.String(length=100), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_payment_transaction_user", "payment_transactions", ["user_id"], unique=False)
    op.create_index("idx_payment_transaction_user_status", "payment_transactions", ["user_id", "status"], unique=False)
    op.create_index("idx_payment_transaction_provider", "payment_transactions", ["provider"], unique=False)
    op.create_index("idx_payment_transaction_provider_order", "payment_transactions", ["provider", "provider_order_id"], unique=False)
    op.create_index("uq_payment_transaction_provider_payment", "payment_transactions", ["provider", "provider_payment_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_payment_transaction_provider_payment", table_name="payment_transactions")
    op.drop_index("idx_payment_transaction_provider_order", table_name="payment_transactions")
    op.drop_index("idx_payment_transaction_provider", table_name="payment_transactions")
    op.drop_index("idx_payment_transaction_user_status", table_name="payment_transactions")
    op.drop_index("idx_payment_transaction_user", table_name="payment_transactions")
    op.drop_table("payment_transactions")
