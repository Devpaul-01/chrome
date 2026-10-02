"""add provider-neutral recurring subscriptions"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "s8t9u0v1w2x3"
down_revision = "r7s8t9u0v1w2"
branch_labels = None
depends_on = None
def upgrade():
    op.create_table("recurring_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_subscription_id", sa.String(length=255), nullable=False),
        sa.Column("provider_plan_id", sa.String(length=255), nullable=False),
        sa.Column("plan_code", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("next_billing_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metadata", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"))
    op.create_index("uq_recurring_subscription_provider_id","recurring_subscriptions",["provider","provider_subscription_id"],unique=True)
    op.create_index("idx_recurring_subscription_user","recurring_subscriptions",["user_id"],unique=False)
    op.create_index("idx_recurring_subscription_user_status","recurring_subscriptions",["user_id","status"],unique=False)
def downgrade():
    op.drop_index("idx_recurring_subscription_user_status", table_name="recurring_subscriptions")
    op.drop_index("idx_recurring_subscription_user", table_name="recurring_subscriptions")
    op.drop_index("uq_recurring_subscription_provider_id", table_name="recurring_subscriptions")
    op.drop_table("recurring_subscriptions")
