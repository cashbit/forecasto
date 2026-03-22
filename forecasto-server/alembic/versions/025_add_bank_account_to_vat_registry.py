"""Add bank_account_id to vat_registries table.

Revision ID: 025_add_bank_account_to_vat_registry
Revises: 024_workspace_bank_accounts_m2m
Create Date: 2026-03-22

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "025_add_bank_account_to_vat_registry"
down_revision = "024_workspace_bank_accounts_m2m"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite does not support ADD COLUMN with FK constraints via ALTER TABLE.
    # We add the column as plain TEXT; SQLAlchemy/application layer handles the relationship.
    op.add_column(
        "vat_registries",
        sa.Column("bank_account_id", sa.String(36), nullable=True),
    )
    op.create_index(
        "ix_vat_registries_bank_account_id",
        "vat_registries",
        ["bank_account_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_vat_registries_bank_account_id", table_name="vat_registries")
    op.drop_column("vat_registries", "bank_account_id")
