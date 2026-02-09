"""Convert workspace-bank_account from many-to-many to 1-to-1 direct FK

Revision ID: 009_workspace_bank_account_direct
Revises: 008_bank_accounts_global
Create Date: 2026-02-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "009_workspace_bank_account_direct"
down_revision: Union[str, None] = "008_bank_accounts_global"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Recreate workspaces table with bank_account_id FK
    op.execute(
        """
        CREATE TABLE workspaces_new (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            fiscal_year INTEGER NOT NULL,
            owner_id VARCHAR(36) NOT NULL REFERENCES users(id),
            is_archived BOOLEAN DEFAULT 0,
            settings JSON,
            email_whitelist JSON,
            description TEXT,
            bank_account_id VARCHAR(36) REFERENCES bank_accounts(id) ON DELETE SET NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE(name, fiscal_year)
        )
        """
    )

    # 2. Copy data + populate bank_account_id from workspace_bank_accounts junction table
    op.execute(
        """
        INSERT INTO workspaces_new (id, name, fiscal_year, owner_id, is_archived, settings, email_whitelist, description, bank_account_id, created_at, updated_at)
        SELECT
            w.id, w.name, w.fiscal_year, w.owner_id, w.is_archived, w.settings, w.email_whitelist, w.description,
            (SELECT wba.bank_account_id FROM workspace_bank_accounts wba
             WHERE wba.workspace_id = w.id
             ORDER BY wba.is_default DESC, wba.created_at ASC
             LIMIT 1),
            w.created_at, w.updated_at
        FROM workspaces w
        """
    )

    # 3. Drop old workspaces and rename
    op.drop_table("workspaces")
    op.rename_table("workspaces_new", "workspaces")

    # 4. Recreate indexes on workspaces
    op.create_index("idx_workspaces_owner", "workspaces", ["owner_id"])
    op.create_index("idx_workspaces_name", "workspaces", ["name"])
    op.create_index("idx_workspaces_bank_account", "workspaces", ["bank_account_id"])

    # 5. Drop workspace_bank_accounts junction table
    op.drop_index("idx_wba_workspace", table_name="workspace_bank_accounts")
    op.drop_index("idx_wba_bank_account", table_name="workspace_bank_accounts")
    op.drop_table("workspace_bank_accounts")

    # 6. Recreate bank_accounts without workspace_id column
    op.execute(
        """
        CREATE TABLE bank_accounts_new (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
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

    op.execute(
        """
        INSERT INTO bank_accounts_new (id, owner_id, name, bank_name, description, currency, credit_limit, is_active, settings, created_at, updated_at)
        SELECT id, owner_id, name, bank_name, description, currency, credit_limit, is_active, settings, created_at, updated_at
        FROM bank_accounts
        """
    )

    op.drop_table("bank_accounts")
    op.rename_table("bank_accounts_new", "bank_accounts")
    op.create_index("idx_bank_accounts_owner", "bank_accounts", ["owner_id"])


def downgrade() -> None:
    # 1. Recreate workspace_bank_accounts junction table
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
    op.create_index("idx_wba_workspace", "workspace_bank_accounts", ["workspace_id"])
    op.create_index("idx_wba_bank_account", "workspace_bank_accounts", ["bank_account_id"])

    conn = op.get_bind()

    # 2. Populate junction table from workspaces.bank_account_id
    op.execute(
        """
        INSERT INTO workspace_bank_accounts (id, workspace_id, bank_account_id, is_default, created_at)
        SELECT
            lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' ||
                substr(hex(randomblob(2)),2) || '-' ||
                substr('89ab', abs(random()) % 4 + 1, 1) ||
                substr(hex(randomblob(2)),2) || '-' ||
                hex(randomblob(6))) as id,
            w.id,
            w.bank_account_id,
            1,
            w.created_at
        FROM workspaces w
        WHERE w.bank_account_id IS NOT NULL
        """
    )

    # 3. Recreate workspaces without bank_account_id
    op.execute(
        """
        CREATE TABLE workspaces_old (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            fiscal_year INTEGER NOT NULL,
            owner_id VARCHAR(36) NOT NULL REFERENCES users(id),
            is_archived BOOLEAN DEFAULT 0,
            settings JSON,
            email_whitelist JSON,
            description TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE(name, fiscal_year)
        )
        """
    )

    op.execute(
        """
        INSERT INTO workspaces_old (id, name, fiscal_year, owner_id, is_archived, settings, email_whitelist, description, created_at, updated_at)
        SELECT id, name, fiscal_year, owner_id, is_archived, settings, email_whitelist, description, created_at, updated_at
        FROM workspaces
        """
    )

    op.drop_table("workspaces")
    op.rename_table("workspaces_old", "workspaces")
    op.create_index("idx_workspaces_owner", "workspaces", ["owner_id"])
    op.create_index("idx_workspaces_name", "workspaces", ["name"])

    # 4. Re-add workspace_id to bank_accounts
    op.execute(
        """
        CREATE TABLE bank_accounts_old (
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

    op.execute(
        """
        INSERT INTO bank_accounts_old (id, workspace_id, owner_id, name, bank_name, description, currency, credit_limit, is_active, settings, created_at, updated_at)
        SELECT id, NULL, owner_id, name, bank_name, description, currency, credit_limit, is_active, settings, created_at, updated_at
        FROM bank_accounts
        """
    )

    op.drop_table("bank_accounts")
    op.rename_table("bank_accounts_old", "bank_accounts")
    op.create_index("idx_bank_accounts_owner", "bank_accounts", ["owner_id"])
