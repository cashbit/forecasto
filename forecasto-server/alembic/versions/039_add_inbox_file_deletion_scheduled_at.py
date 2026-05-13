"""Add file_deletion_scheduled_at to inbox_items.

Data-retention policy: rejected items have their source file deleted from
disk 7 days after rejection. This column carries the scheduled timestamp;
the in-process scheduler picks up rows whose timestamp is in the past.

Confirmed items get their file deleted synchronously at confirm time, so
no schedule is needed for them.

Backfill: existing rejected items get `updated_at + 7 days` so they are
processed by the next scheduler tick.

Revision ID: 039
Revises: 038
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa


revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inbox_items",
        sa.Column("file_deletion_scheduled_at", sa.DateTime(), nullable=True),
    )
    # Backfill: schedule deletion for rejected items 7 days after their last update.
    op.execute(
        """
        UPDATE inbox_items
           SET file_deletion_scheduled_at = datetime(updated_at, '+7 days')
         WHERE status = 'rejected'
           AND file_deletion_scheduled_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("inbox_items", "file_deletion_scheduled_at")
