"""Add reminder_count and last_reminder_sent_at to records table.

Revision ID: 037
Revises: 036
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "records",
        sa.Column("reminder_count", sa.Integer(), nullable=False, server_default="-1"),
    )
    op.add_column(
        "records",
        sa.Column("last_reminder_sent_at", sa.Date(), nullable=True),
    )
    op.create_index(
        "ix_records_reminder_count",
        "records",
        ["reminder_count"],
    )


def downgrade() -> None:
    op.drop_index("ix_records_reminder_count", table_name="records")
    op.drop_column("records", "last_reminder_sent_at")
    op.drop_column("records", "reminder_count")
