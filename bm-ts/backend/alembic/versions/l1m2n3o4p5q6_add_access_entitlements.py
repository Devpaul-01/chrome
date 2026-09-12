"""add provider-neutral access entitlements

Revision ID: l1m2n3o4p5q6
Revises: k1l2m3n4o5p6
Create Date: 2026-08-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "l1m2n3o4p5q6"
down_revision: Union[str, Sequence[str], None] = "k1l2m3n4o5p6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "access_entitlements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_code", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'ACTIVE'"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_provider", sa.String(length=32), nullable=False),
        sa.Column("source_payment_id", sa.String(length=255), nullable=False),
        sa.Column("source_transaction_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_transaction_id"], ["payment_transactions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_access_entitlement_user", "access_entitlements", ["user_id"], unique=False)
    op.create_index("idx_access_entitlement_user_status_expiry", "access_entitlements", ["user_id", "status", "expires_at"], unique=False)
    op.create_index("idx_access_entitlement_expires", "access_entitlements", ["expires_at"], unique=False)
    op.create_index("uq_access_entitlement_provider_payment", "access_entitlements", ["source_provider", "source_payment_id"], unique=True)
    op.create_index(
        "uq_access_entitlement_source_transaction",
        "access_entitlements",
        ["source_transaction_id"],
        unique=True,
        postgresql_where=sa.text("source_transaction_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_access_entitlement_source_transaction", table_name="access_entitlements")
    op.drop_index("uq_access_entitlement_provider_payment", table_name="access_entitlements")
    op.drop_index("idx_access_entitlement_expires", table_name="access_entitlements")
    op.drop_index("idx_access_entitlement_user_status_expiry", table_name="access_entitlements")
    op.drop_index("idx_access_entitlement_user", table_name="access_entitlements")
    op.drop_table("access_entitlements")
