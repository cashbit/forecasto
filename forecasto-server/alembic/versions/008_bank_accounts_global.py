"""Make bank accounts global (user-owned) with workspace association table

Revision ID: 008_bank_accounts_global
Revises: 007_review_date
Create Date: 2026-02-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "008_bank_accounts_global"
down_revision: Union[str, None] = "007_review_date"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create workspace_bank_accounts association table
    op.create_table(
        "workspace_bank_accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "bank_account_id",
            sa.String(36),
            sa.ForeignKey("bank_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("is_default", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "workspace_id", "bank_account_id", name="uq_workspace_bank_account"
        ),
    )
    op.create_index(
        "idx_wba_workspace", "workspace_bank_accounts", ["workspace_id"]
    )
    op.create_index(
        "idx_wba_bank_account", "workspace_bank_accounts", ["bank_account_id"]
    )

    # 2. Migrate existing data: create association rows from current workspace_id
    conn = op.get_bind()

    # For each bank_account with a workspace_id, create a workspace_bank_accounts row
    # Also determine the owner_id from the workspace's owner
    conn.execute(
        sa.text(
            """
            INSERT INTO workspace_bank_accounts (id, workspace_id, bank_account_id, is_default, created_at)
            SELECT
                lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
                    substr(hex(randomblob(2)),2) || '-' ||
                    substr('89ab', abs(random()) % 4 + 1, 1) ||
                    substr(hex(randomblob(2)),2) || '-' ||
                    hex(randomblob(6))) as id,
                ba.workspace_id,
                ba.id,
                ba.is_default,
                ba.created_at
            FROM bank_accounts ba
            WHERE ba.workspace_id IS NOT NULL
            """
        )
    )

    # 3. Recreate bank_accounts table manually (SQLite doesn't support DROP COLUMN)
    # Create new table with desired schema
    op.execute(
        """
        CREATE TABLE bank_accounts_new (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            workspace_id VARCHAR(36),
            owner_id VARCHAR(36) REFERENCES users(id),
            name VARCHAR(255) NOT NULL,
            bank_name VARCHAR(255),
            description TEXT,
            currency VARCHAR(3) DEFAULT 'EUR',
            credit_limit NUMERIC(15, 2) DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            settings JSON DEFAULT '{}',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
        """
    )

    # 4. Copy data from old table to new, setting owner_id from workspace owner
    op.execute(
        """
        INSERT INTO bank_accounts_new (id, workspace_id, owner_id, name, bank_name, currency, credit_limit, is_active, settings, created_at, updated_at)
        SELECT
            ba.id, ba.workspace_id,
            (SELECT w.owner_id FROM workspaces w WHERE w.id = ba.workspace_id),
            ba.name, ba.bank_name, ba.currency, ba.credit_limit, ba.is_active, ba.settings,
            ba.created_at, ba.updated_at
        FROM bank_accounts ba
        """
    )

    # 5. Drop old table and rename new
    op.drop_table("bank_accounts")
    op.rename_table("bank_accounts_new", "bank_accounts")

    # 6. Create index on owner_id
    op.create_index("idx_bank_accounts_owner", "bank_accounts", ["owner_id"])


def downgrade() -> None:
    # Drop index
    op.drop_index("idx_bank_accounts_owner", table_name="bank_accounts")

    # Recreate bank_accounts with original schema
    op.execute(
        """
        CREATE TABLE bank_accounts_old (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            iban VARCHAR(34),
            bic_swift VARCHAR(11),
            bank_name VARCHAR(255),
            currency VARCHAR(3) DEFAULT 'EUR',
            credit_limit NUMERIC(15, 2) DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            is_default BOOLEAN DEFAULT 0,
            settings JSON DEFAULT '{}',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
        """
    )
    op.execute(
        """
        INSERT INTO bank_accounts_old (id, workspace_id, name, bank_name, currency, credit_limit, is_active, settings, created_at, updated_at)
        SELECT id, COALESCE(workspace_id, ''), name, bank_name, currency, credit_limit, is_active, settings, created_at, updated_at
        FROM bank_accounts
        """
    )
    op.drop_table("bank_accounts")
    op.rename_table("bank_accounts_old", "bank_accounts")

    # Drop association table
    op.drop_index("idx_wba_bank_account", table_name="workspace_bank_accounts")
    op.drop_index("idx_wba_workspace", table_name="workspace_bank_accounts")
    op.drop_table("workspace_bank_accounts")
