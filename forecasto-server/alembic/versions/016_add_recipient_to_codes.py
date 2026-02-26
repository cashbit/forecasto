"""add_recipient_to_registration_codes

Revision ID: 016_add_recipient_to_codes
Revises: 015_drop_projects_tables
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '016_add_recipient_to_codes'
down_revision: Union[str, None] = '015_drop_projects_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('registration_codes', sa.Column('recipient_name', sa.String(100), nullable=True))
    op.add_column('registration_codes', sa.Column('recipient_email', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('registration_codes', 'recipient_email')
    op.drop_column('registration_codes', 'recipient_name')
