"""Add agent_tokens table and document_type to inbox_items.

Revision ID: 030
Revises: 029
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = "030"
down_revision = "029_add_inbox_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Agent tokens table
    op.create_table(
        "agent_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("last_used_at", sa.DateTime, nullable=True),
        sa.Column("revoked_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_agent_tokens_user_id", "agent_tokens", ["user_id"])
    op.create_index("ix_agent_tokens_token_hash", "agent_tokens", ["token_hash"], unique=True)

    # New columns on inbox_items
    op.add_column("inbox_items", sa.Column("document_type", sa.String(50), nullable=True))
    op.add_column("inbox_items", sa.Column("reconciliation_matches", sa.JSON, nullable=True, server_default="[]"))


def downgrade() -> None:
    op.drop_column("inbox_items", "reconciliation_matches")
    op.drop_column("inbox_items", "document_type")
    op.drop_index("ix_agent_tokens_token_hash", "agent_tokens")
    op.drop_index("ix_agent_tokens_user_id", "agent_tokens")
    op.drop_table("agent_tokens")
