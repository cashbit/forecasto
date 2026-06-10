"""add per-member collection permissions

Adds three workspace-level boolean permissions to workspace_members and
invitations: can_create_collections, can_write_collections, can_read_collections.

Backfill preserves current behaviour:
- read: everyone could read collections -> True for all
- write: any non-viewer could write documents -> True, except viewers (False)
- create: only owner/admin could create -> False for member/viewer
  (owner/admin set True for cosmetic consistency; they bypass the checks anyway)

Revision ID: 041
Revises: 040
Create Date: 2026-06-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "041"
down_revision: Union[str, None] = "040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("workspace_members", "invitations"):
        op.add_column(
            table,
            sa.Column("can_create_collections", sa.Boolean(), nullable=False, server_default="0"),
        )
        op.add_column(
            table,
            sa.Column("can_write_collections", sa.Boolean(), nullable=False, server_default="1"),
        )
        op.add_column(
            table,
            sa.Column("can_read_collections", sa.Boolean(), nullable=False, server_default="1"),
        )
        # Backfill role-appropriate values for existing rows.
        op.execute(
            f"UPDATE {table} SET can_write_collections = 0 WHERE role = 'viewer'"
        )
        op.execute(
            f"UPDATE {table} SET can_create_collections = 1 WHERE role IN ('owner', 'admin')"
        )


def downgrade() -> None:
    for table in ("invitations", "workspace_members"):
        op.drop_column(table, "can_read_collections")
        op.drop_column(table, "can_write_collections")
        op.drop_column(table, "can_create_collections")
