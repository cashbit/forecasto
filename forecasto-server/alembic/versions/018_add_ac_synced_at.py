"""Add ac_synced_at to registration_codes.

Revision ID: 018_add_ac_synced_at
Revises: 017_add_fts5
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa

revision = "018_add_ac_synced_at"
down_revision = "017_add_fts5"


def upgrade() -> None:
    op.add_column("registration_codes", sa.Column("ac_synced_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("registration_codes", "ac_synced_at")
