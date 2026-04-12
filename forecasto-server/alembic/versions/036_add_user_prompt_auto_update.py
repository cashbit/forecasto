"""Add agent_prompt_auto_update to users table.

Revision ID: 036
Revises: 035
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("agent_prompt_auto_update", sa.Boolean(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "agent_prompt_auto_update")
