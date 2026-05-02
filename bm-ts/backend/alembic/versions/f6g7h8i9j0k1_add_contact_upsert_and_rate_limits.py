"""add contact upsert constraint and send_rate_limits table

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-04-12 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSON


# revision identifiers, used by Alembic.
revision: str = "f6g7h8i9j0k1"
down_revision: Union[str, Sequence[str], None] = "e5f6g7h8i9j0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    1. Add unique constraint on (user_id, facebook_profile_url) for upsert support.
    2. Create send_rate_limits table for server-side rate enforcement.
    """
    # 1. Unique constraint on contacts for upsert dedup
    op.create_index(
        "uq_contact_user_profile_url",
        "contacts",
        ["user_id", "facebook_profile_url"],
        unique=True,
    )

    # 2. Server-side rate-limit tracking table
    op.create_table(
        "send_rate_limits",
        sa.Column(
            "id",
            PG_UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "timestamps", JSON(), nullable=False, server_default=sa.text("'[]'::json")
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "idx_send_rate_limit_user", "send_rate_limits", ["user_id"], unique=True
    )


def downgrade() -> None:
    """Reverse: drop send_rate_limits table and contact unique index."""
    op.drop_index("idx_send_rate_limit_user", table_name="send_rate_limits")
    op.drop_table("send_rate_limits")
    op.drop_index("uq_contact_user_profile_url", table_name="contacts")
