"""Add inbox_items table for Forecasto Agent document queue.

Revision ID: 029_add_inbox_items
Revises: 028_add_withholding_rate
Create Date: 2026-03-30

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "029_add_inbox_items"
down_revision = "028_add_withholding_rate"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inbox_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("source_path", sa.Text, nullable=False),
        sa.Column("source_filename", sa.String(255), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("source_deleted", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("llm_provider", sa.String(50), nullable=False),
        sa.Column("llm_model", sa.String(100), nullable=False),
        sa.Column("agent_version", sa.String(50), nullable=True),
        sa.Column("extracted_data", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("confirmed_record_ids", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_inbox_items_workspace_id", "inbox_items", ["workspace_id"])
    op.create_index("ix_inbox_items_status", "inbox_items", ["status"])


def downgrade() -> None:
    op.drop_index("ix_inbox_items_status", table_name="inbox_items")
    op.drop_index("ix_inbox_items_workspace_id", table_name="inbox_items")
    op.drop_table("inbox_items")
