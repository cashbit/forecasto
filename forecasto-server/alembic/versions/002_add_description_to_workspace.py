"""Add description to workspace

Revision ID: 002_description
Revises: 001_initial
Create Date: 2026-02-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_description'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workspaces', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('workspaces', 'description')
