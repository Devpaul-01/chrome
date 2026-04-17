"""add source column to user_images

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-04-17 00:00:00.000000

Adds a `source` column to user_images to distinguish between images explicitly
uploaded by the user ('library') and images composed on-the-fly when sending
a timeline post ('post').  The library endpoint only returns 'library' images.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, Sequence[str], None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'user_images',
        sa.Column(
            'source',
            sa.String(length=32),
            nullable=False,
            server_default='library',
        ),
    )
    op.create_index('idx_user_image_source', 'user_images', ['user_id', 'source'])


def downgrade() -> None:
    op.drop_index('idx_user_image_source', table_name='user_images')
    op.drop_column('user_images', 'source')
