"""add seq_num to records and next_seq_num to users

Revision ID: 013_add_seq_num
Revises: 476938b88143
Create Date: 2026-02-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '013_add_seq_num'
down_revision: Union[str, None] = '476938b88143'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add next_seq_num to users
    op.add_column('users', sa.Column('next_seq_num', sa.Integer(), nullable=False, server_default='1'))

    # Add seq_num to records
    op.add_column('records', sa.Column('seq_num', sa.Integer(), nullable=True))

    # Populate existing records with sequential numbers per workspace owner
    # ordered by created_at
    conn = op.get_bind()

    # Get all workspace owners
    owners = conn.execute(
        sa.text("SELECT DISTINCT u.id FROM users u JOIN workspaces w ON w.owner_id = u.id")
    ).fetchall()

    for (owner_id,) in owners:
        # Get all records from workspaces owned by this user, ordered by created_at
        records = conn.execute(
            sa.text("""
                SELECT r.id FROM records r
                JOIN workspaces w ON r.workspace_id = w.id
                WHERE w.owner_id = :owner_id AND r.deleted_at IS NULL
                ORDER BY r.created_at ASC
            """),
            {"owner_id": owner_id}
        ).fetchall()

        for idx, (record_id,) in enumerate(records, start=1):
            conn.execute(
                sa.text("UPDATE records SET seq_num = :seq WHERE id = :rid"),
                {"seq": idx, "rid": record_id}
            )

        # Set next_seq_num for this owner
        next_num = len(records) + 1
        conn.execute(
            sa.text("UPDATE users SET next_seq_num = :next WHERE id = :uid"),
            {"next": next_num, "uid": owner_id}
        )


def downgrade() -> None:
    op.drop_column('records', 'seq_num')
    op.drop_column('users', 'next_seq_num')
