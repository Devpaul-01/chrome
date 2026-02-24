"""
Revision ID: 20260218_add_post_font_fields
Revises: None
Create Date: 2026-02-18

Add font customization fields to posts table
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260218_add_post_font_fields'
down_revision = None  # Set to previous revision id if this is not the first migration
branch_labels = None
depends_on = None
def upgrade():
    op.execute("UPDATE posts SET font_family = 'Arial', font_size = 48, font_color = '#ffffff' WHERE font_family IS NULL")
    op.create_check_constraint('check_font_size_range', 'posts', 'font_size >= 24 AND font_size <= 96')
    op.execute("COMMENT ON COLUMN posts.font_family IS 'Font family for text overlay on post images'")
    op.execute("COMMENT ON COLUMN posts.font_size IS 'Font size in pixels (24-96) for text overlay on post images'")
    op.execute("COMMENT ON COLUMN posts.font_color IS 'Hex color code for text overlay on post images'")

def downgrade():
    op.drop_constraint('check_font_size_range', 'posts', type_='check')
    op.drop_column('posts', 'font_size')
    op.drop_column('posts', 'font_family')
