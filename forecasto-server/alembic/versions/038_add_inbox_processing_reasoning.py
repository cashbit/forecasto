"""Add processing_reasoning to inbox_items.

Stores the LLM's free-text explanation of how it processed the document,
shown in the GUI to make extraction choices auditable.

Revision ID: 038
Revises: 037
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inbox_items",
        sa.Column("processing_reasoning", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inbox_items", "processing_reasoning")
