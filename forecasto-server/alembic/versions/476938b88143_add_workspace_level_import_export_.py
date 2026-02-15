"""add_workspace_level_import_export_permissions

Revision ID: 476938b88143
Revises: 012_add_vat_deduction
Create Date: 2026-02-15 19:36:01.172757

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '476938b88143'
down_revision: Union[str, None] = '012_add_vat_deduction'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add workspace-level permission columns to workspace_members
    op.add_column('workspace_members', sa.Column('can_import', sa.Boolean(), nullable=False, server_default='1'))
    op.add_column('workspace_members', sa.Column('can_import_sdi', sa.Boolean(), nullable=False, server_default='1'))
    op.add_column('workspace_members', sa.Column('can_export', sa.Boolean(), nullable=False, server_default='1'))

    # Add workspace-level permission columns to invitations
    op.add_column('invitations', sa.Column('can_import', sa.Boolean(), nullable=False, server_default='1'))
    op.add_column('invitations', sa.Column('can_import_sdi', sa.Boolean(), nullable=False, server_default='1'))
    op.add_column('invitations', sa.Column('can_export', sa.Boolean(), nullable=False, server_default='1'))


def downgrade() -> None:
    # Remove workspace-level permission columns from invitations
    op.drop_column('invitations', 'can_export')
    op.drop_column('invitations', 'can_import_sdi')
    op.drop_column('invitations', 'can_import')

    # Remove workspace-level permission columns from workspace_members
    op.drop_column('workspace_members', 'can_export')
    op.drop_column('workspace_members', 'can_import_sdi')
    op.drop_column('workspace_members', 'can_import')
