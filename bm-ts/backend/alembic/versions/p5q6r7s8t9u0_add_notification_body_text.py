"""Add plain-text notification body.

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
"""
from alembic import op
import sqlalchemy as sa

revision = "p5q6r7s8t9u0"
down_revision = "o4p5q6r7s8t9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notification_outbox",
        sa.Column("body_text", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("notification_outbox", "body_text")
