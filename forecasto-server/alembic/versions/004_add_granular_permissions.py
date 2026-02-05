"""Add granular_permissions to workspace_members and invitations

Revision ID: 004_granular_permissions
Revises: 003_project_code
Create Date: 2026-02-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.sqlite import JSON


# revision identifiers, used by Alembic.
revision: str = '004_granular_permissions'
down_revision: Union[str, None] = '003_project_code'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _default_granular_permissions() -> dict:
    """Default granular permissions - all permissions enabled."""
    return {
        "budget": {
            "in": {"can_read_others": True, "can_create": True, "can_edit_others": True},
            "out": {"can_read_others": True, "can_create": True, "can_edit_others": True},
        },
        "prospect": {
            "in": {"can_read_others": True, "can_create": True, "can_edit_others": True},
            "out": {"can_read_others": True, "can_create": True, "can_edit_others": True},
        },
        "orders": {
            "in": {"can_read_others": True, "can_create": True, "can_edit_others": True},
            "out": {"can_read_others": True, "can_create": True, "can_edit_others": True},
        },
        "actual": {
            "in": {"can_read_others": True, "can_create": True, "can_edit_others": True},
            "out": {"can_read_others": True, "can_create": True, "can_edit_others": True},
        },
    }


def upgrade() -> None:
    # Add granular_permissions column to workspace_members
    op.add_column(
        'workspace_members',
        sa.Column('granular_permissions', JSON, nullable=True)
    )

    # Add granular_permissions column to invitations
    op.add_column(
        'invitations',
        sa.Column('granular_permissions', JSON, nullable=True)
    )

    # Set default values for existing rows
    # Using raw SQL for SQLite compatibility
    conn = op.get_bind()

    default_perms = _default_granular_permissions()
    import json
    default_json = json.dumps(default_perms)

    conn.execute(
        sa.text(f"UPDATE workspace_members SET granular_permissions = :perms WHERE granular_permissions IS NULL"),
        {"perms": default_json}
    )
    conn.execute(
        sa.text(f"UPDATE invitations SET granular_permissions = :perms WHERE granular_permissions IS NULL"),
        {"perms": default_json}
    )


def downgrade() -> None:
    # Remove granular_permissions columns
    with op.batch_alter_table('workspace_members') as batch_op:
        batch_op.drop_column('granular_permissions')

    with op.batch_alter_table('invitations') as batch_op:
        batch_op.drop_column('granular_permissions')
