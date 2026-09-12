"""add group tags, group_id FK, unique titles/labels

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-04-16 00:00:00.000000

Simplifies message_groups to pure label/tag model (drops gender, segment_ids;
adds color).  Adds group_id FK to message_templates, posts, contacts.
Adds unique constraints on (user_id, title) for message_templates and
partial unique on (user_id, label) for posts where label IS NOT NULL.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


# revision identifiers, used by Alembic.
revision: str = "g7h8i9j0k1l2"
down_revision: Union[str, Sequence[str], None] = "f6g7h8i9j0k1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- 1. Simplify message_groups: drop gender/segment_ids, add color --
    op.drop_index("idx_message_group_user_gender", table_name="message_groups")
    op.drop_column("message_groups", "gender")
    op.drop_column("message_groups", "segment_ids")
    op.add_column(
        "message_groups",
        sa.Column(
            "color", sa.Text(), server_default=sa.text("'#6b7280'"), nullable=False
        ),
    )
    op.create_index("idx_message_group_user", "message_groups", ["user_id"])

    # -- 2. Add group_id FK to message_templates --
    op.add_column(
        "message_templates",
        sa.Column(
            "group_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("message_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_message_template_group", "message_templates", ["group_id"])

    # -- 3. Add group_id FK to posts --
    op.add_column(
        "posts",
        sa.Column(
            "group_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("message_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_post_group", "posts", ["group_id"])

    # -- 4. Add group_id FK to contacts --
    op.add_column(
        "contacts",
        sa.Column(
            "group_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("message_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_contact_group", "contacts", ["group_id"])

    # -- 5. Unique constraint: message_templates (user_id, title) --
    op.create_index(
        "uq_message_template_user_title",
        "message_templates",
        ["user_id", "title"],
        unique=True,
    )

    # -- 6. Partial unique constraint: posts (user_id, label) WHERE label IS NOT NULL --
    op.create_index(
        "uq_post_user_label",
        "posts",
        ["user_id", "label"],
        unique=True,
        postgresql_where=sa.text("label IS NOT NULL"),
    )


def downgrade() -> None:
    # Reverse order
    op.drop_index("uq_post_user_label", table_name="posts")
    op.drop_index("uq_message_template_user_title", table_name="message_templates")

    op.drop_index("idx_contact_group", table_name="contacts")
    op.drop_column("contacts", "group_id")

    op.drop_index("idx_post_group", table_name="posts")
    op.drop_column("posts", "group_id")

    op.drop_index("idx_message_template_group", table_name="message_templates")
    op.drop_column("message_templates", "group_id")

    op.drop_index("idx_message_group_user", table_name="message_groups")
    op.drop_column("message_groups", "color")
    op.add_column(
        "message_groups",
        sa.Column(
            "segment_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.add_column(
        "message_groups",
        sa.Column(
            "gender", sa.Text(), nullable=False, server_default=sa.text("'NEUTRAL'")
        ),
    )
    op.create_index(
        "idx_message_group_user_gender", "message_groups", ["user_id", "gender"]
    )
