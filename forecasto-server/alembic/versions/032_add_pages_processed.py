"""Add pages_processed to document_processing_jobs and usage_records.

Revision ID: 032
Revises: 031
"""

from alembic import op
import sqlalchemy as sa

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "document_processing_jobs",
        sa.Column("pages_processed", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "usage_records",
        sa.Column("pages_processed", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("usage_records", "pages_processed")
    op.drop_column("document_processing_jobs", "pages_processed")
