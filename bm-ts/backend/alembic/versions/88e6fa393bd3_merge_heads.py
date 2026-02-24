"""merge heads

Revision ID: 88e6fa393bd3
Revises: 20260218_add_post_font_fields, a32e3aa11961
Create Date: 2026-02-24 09:46:50.819294

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '88e6fa393bd3'
down_revision: Union[str, Sequence[str], None] = ('20260218_add_post_font_fields', 'a32e3aa11961')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
