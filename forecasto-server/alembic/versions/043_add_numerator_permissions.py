"""add per-member numerator permissions

Adds three workspace-level boolean permissions to workspace_members and
invitations: can_create_numerators, can_write_numerators, can_read_numerators.
Mirrors the collection permissions (migration 041).

Backfill preserves sensible behaviour:
- read: everyone can read numerators -> True for all
- write (reserve/confirm a number): any non-viewer -> True, viewers -> False
- create (create/update/delete a numerator): only owner/admin -> True, others False

Revision ID: 043
Revises: 042
Create Date: 2026-06-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "043"
down_revision: Union[str, None] = "042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("workspace_members", "invitations"):
        op.add_column(
            table,
            sa.Column("can_create_numerators", sa.Boolean(), nullable=False, server_default="0"),
        )
        op.add_column(
            table,
            sa.Column("can_write_numerators", sa.Boolean(), nullable=False, server_default="1"),
        )
        op.add_column(
            table,
            sa.Column("can_read_numerators", sa.Boolean(), nullable=False, server_default="1"),
        )
        # Backfill role-appropriate values for existing rows.
        op.execute(
            f"UPDATE {table} SET can_write_numerators = 0 WHERE role = 'viewer'"
        )
        op.execute(
            f"UPDATE {table} SET can_create_numerators = 1 WHERE role IN ('owner', 'admin')"
        )


def downgrade() -> None:
    for table in ("invitations", "workspace_members"):
        op.drop_column(table, "can_read_numerators")
        op.drop_column(table, "can_write_numerators")
        op.drop_column(table, "can_create_numerators")
