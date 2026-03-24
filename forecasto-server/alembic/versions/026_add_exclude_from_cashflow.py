"""Add exclude_from_cashflow to bank_accounts table.

Revision ID: 026_add_exclude_from_cashflow
Revises: 025_add_bank_account_to_vat_registry
Create Date: 2026-03-24

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "026_add_exclude_from_cashflow"
down_revision = "025_add_bank_account_to_vat_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bank_accounts",
        sa.Column("exclude_from_cashflow", sa.Boolean(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("bank_accounts", "exclude_from_cashflow")
