"""Add durable plan-switch intents; does not enable billing."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "t9u0v1w2x3y4"
down_revision = "s8t9u0v1w2x3"
branch_labels = None
depends_on = None
def upgrade():
    op.create_table("plan_switch_intents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("from_plan", sa.String(16), nullable=False),
        sa.Column("target_plan", sa.String(16), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="PENDING"),
        sa.Column("provider_reference", sa.String(255)),
        sa.Column("metadata_payload", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.create_index("uq_plan_switch_user_key", "plan_switch_intents", ["user_id", "idempotency_key"], unique=True)
    op.execute("CREATE UNIQUE INDEX uq_plan_switch_one_open_per_user ON plan_switch_intents (user_id) WHERE status IN ('PENDING', 'REQUIRES_APPROVAL', 'AWAITING_SETTLEMENT')")
def downgrade():
    op.drop_index("uq_plan_switch_one_open_per_user", table_name="plan_switch_intents")
    op.drop_index("uq_plan_switch_user_key", table_name="plan_switch_intents")
    op.drop_table("plan_switch_intents")
