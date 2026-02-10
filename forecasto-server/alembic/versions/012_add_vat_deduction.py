"""Add vat_deduction column to records table

Revision ID: 012_add_vat_deduction
Revises: 011_add_billing_system
Create Date: 2026-02-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "012_add_vat_deduction"
down_revision: Union[str, None] = "011_add_billing_system"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "records",
        sa.Column("vat_deduction", sa.Numeric(5, 2), server_default="100.00", nullable=True),
    )


def downgrade() -> None:
    op.drop_column("records", "vat_deduction")
