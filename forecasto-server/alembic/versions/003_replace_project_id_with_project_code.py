"""Replace project_id and phase_id with project_code

Revision ID: 003_project_code
Revises: 002_description
Create Date: 2026-02-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003_project_code'
down_revision: Union[str, None] = '002_description'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add project_code column
    op.add_column('records', sa.Column('project_code', sa.String(100), nullable=True))
    op.create_index('ix_records_project_code', 'records', ['project_code'])

    # Remove project_id and phase_id columns
    # Note: SQLite batch mode automatically handles FK constraints when rebuilding the table
    with op.batch_alter_table('records', recreate='always') as batch_op:
        batch_op.drop_column('project_id')
        batch_op.drop_column('phase_id')


def downgrade() -> None:
    # Re-add project_id and phase_id columns
    with op.batch_alter_table('records') as batch_op:
        batch_op.add_column(sa.Column('project_id', sa.String(36), nullable=True))
        batch_op.add_column(sa.Column('phase_id', sa.String(36), nullable=True))
        batch_op.create_foreign_key('fk_records_project_id_projects', 'projects', ['project_id'], ['id'])
        batch_op.create_foreign_key('fk_records_phase_id_project_phases', 'project_phases', ['phase_id'], ['id'])

    # Remove project_code
    op.drop_index('ix_records_project_code', table_name='records')
    op.drop_column('records', 'project_code')
