"""Add deleted_at to users table for GDPR account deletion.

Revision ID: 027_add_deleted_at_to_users
Revises: 026_add_exclude_from_cashflow
Create Date: 2026-03-30

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "027_add_deleted_at_to_users"
down_revision = "026_add_exclude_from_cashflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "deleted_at")
