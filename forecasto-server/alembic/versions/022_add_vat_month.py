"""Add vat_month column to records table

Revision ID: 013_add_vat_month
Revises: 021
Create Date: 2026-03-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "022_add_vat_month"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "records",
        sa.Column("vat_month", sa.String(7), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("records", "vat_month")
