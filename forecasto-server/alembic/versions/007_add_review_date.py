"""Add review_date column to records

Revision ID: 007_review_date
Revises: 006_registration_codes
Create Date: 2026-02-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "007_review_date"
down_revision: Union[str, None] = "006_registration_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add review_date column (nullable)
    op.add_column("records", sa.Column("review_date", sa.Date, nullable=True))

    # Set default review_date for existing records: date_offer + 7 days
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE records SET review_date = date(date_offer, '+7 days') WHERE review_date IS NULL"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("records", recreate="always") as batch_op:
        batch_op.drop_column("review_date")
