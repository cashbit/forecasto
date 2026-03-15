"""add ui_preferences to users

Revision ID: 021
Revises: 476938b88143
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = '021'
down_revision = '021_merge'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('ui_preferences', sa.JSON(), nullable=True))
    op.execute("UPDATE users SET ui_preferences = '{}'")


def downgrade() -> None:
    op.drop_column('users', 'ui_preferences')
