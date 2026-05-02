"""repair optional group_id columns

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-04-30 00:00:00.000000

Repairs installs where group_id columns were created as NOT NULL or were not
added despite the application treating them as optional.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


# revision identifiers, used by Alembic.
revision: str = "i9j0k1l2m3n4"
down_revision: Union[str, Sequence[str], None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def _ensure_nullable_group_id(
    inspector: sa.Inspector,
    table_name: str,
    index_name: str,
) -> None:
    if not _has_column(inspector, table_name, "group_id"):
        op.add_column(
            table_name,
            sa.Column(
                "group_id",
                PG_UUID(as_uuid=True),
                sa.ForeignKey("message_groups.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        if not _has_index(inspector, table_name, index_name):
            op.create_index(index_name, table_name, ["group_id"])
        return

    op.alter_column(
        table_name,
        "group_id",
        existing_type=PG_UUID(as_uuid=True),
        nullable=True,
    )
    if not _has_index(inspector, table_name, index_name):
        op.create_index(index_name, table_name, ["group_id"])


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    _ensure_nullable_group_id(inspector, "message_templates", "idx_message_template_group")
    _ensure_nullable_group_id(inspector, "posts", "idx_post_group")
    _ensure_nullable_group_id(inspector, "contacts", "idx_contact_group")


def downgrade() -> None:
    # Repair migration only. Downgrade is intentionally a no-op because the
    # previous broken/null-rejecting state should not be restored.
    pass