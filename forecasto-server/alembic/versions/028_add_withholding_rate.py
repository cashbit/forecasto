"""Add withholding_rate to records for ritenuta d'acconto simulation.

Revision ID: 028_add_withholding_rate
Revises: 027_add_deleted_at_to_users
Create Date: 2026-03-30

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "028_add_withholding_rate"
down_revision = "027_add_deleted_at_to_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "records",
        sa.Column("withholding_rate", sa.Numeric(5, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("records", "withholding_rate")
