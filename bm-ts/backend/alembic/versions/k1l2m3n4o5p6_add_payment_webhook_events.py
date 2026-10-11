"""add payment webhook events

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-08-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, Sequence[str], None] = "j0k1l2m3n4o5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_webhook_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "provider",
            sa.String(length=32),
            nullable=False,
        ),
        sa.Column(
            "provider_event_id",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "provider_delivery_id",
            sa.String(length=255),
            nullable=True,
        ),
        sa.Column(
            "provider_payment_id",
            sa.String(length=255),
            nullable=True,
        ),
        sa.Column(
            "event_type",
            sa.String(length=100),
            nullable=False,
        ),
        sa.Column(
            "is_redelivery",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "processing_status",
            sa.String(length=32),
            server_default=sa.text("'received'"),
            nullable=False,
        ),
        sa.Column(
            "payload",
            sa.JSON(),
            server_default=sa.text("'{}'::json"),
            nullable=False,
        ),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "processing_error",
            sa.Text(),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "uq_payment_webhook_event_provider_event",
        "payment_webhook_events",
        ["provider", "provider_event_id"],
        unique=True,
    )

    op.create_index(
        "idx_payment_webhook_event_provider_payment",
        "payment_webhook_events",
        ["provider", "provider_payment_id"],
        unique=False,
    )

    op.create_index(
        "idx_payment_webhook_event_status",
        "payment_webhook_events",
        ["processing_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_payment_webhook_event_status",
        table_name="payment_webhook_events",
    )

    op.drop_index(
        "idx_payment_webhook_event_provider_payment",
        table_name="payment_webhook_events",
    )

    op.drop_index(
        "uq_payment_webhook_event_provider_event",
        table_name="payment_webhook_events",
    )

    op.drop_table("payment_webhook_events")