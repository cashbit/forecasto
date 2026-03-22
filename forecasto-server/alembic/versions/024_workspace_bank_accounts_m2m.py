"""Add workspace_bank_accounts junction table for many-to-many relationship.

Revision ID: 024_workspace_bank_accounts_m2m
Revises: 023_add_vat_registries
Create Date: 2026-03-22

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "024_workspace_bank_accounts_m2m"
down_revision = "023_add_vat_registries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create junction table workspace_bank_accounts
    op.execute("""
        CREATE TABLE workspace_bank_accounts (
            id TEXT NOT NULL PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
            created_at DATETIME NOT NULL,
            UNIQUE(workspace_id, bank_account_id)
        )
    """)

    op.execute("""
        CREATE INDEX idx_wba_workspace ON workspace_bank_accounts (workspace_id)
    """)

    op.execute("""
        CREATE INDEX idx_wba_bank_account ON workspace_bank_accounts (bank_account_id)
    """)

    # Migrate existing 1-to-1 associations from workspaces.bank_account_id
    op.execute("""
        INSERT INTO workspace_bank_accounts (id, workspace_id, bank_account_id, created_at)
        SELECT
            lower(hex(randomblob(4))) || '-' ||
            lower(hex(randomblob(2))) || '-4' ||
            lower(substr(hex(randomblob(2)), 2)) || '-' ||
            lower(substr('89ab', abs(random()) % 4 + 1, 1)) ||
            lower(substr(hex(randomblob(2)), 2)) || '-' ||
            lower(hex(randomblob(6))),
            id,
            bank_account_id,
            COALESCE(created_at, datetime('now'))
        FROM workspaces
        WHERE bank_account_id IS NOT NULL
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS workspace_bank_accounts")
