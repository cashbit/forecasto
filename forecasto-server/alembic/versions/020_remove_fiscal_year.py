"""remove fiscal_year from workspaces

Revision ID: 020
Revises: 019
Create Date: 2026-03-15

"""
from alembic import op

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None

INSERT_UPGRADE = """
    INSERT INTO workspaces_new
    SELECT id, name, description, owner_id, is_archived,
           COALESCE(settings, '{}'), COALESCE(email_whitelist, '[]'),
           bank_account_id, created_at, updated_at
    FROM workspaces
"""

INSERT_DOWNGRADE = """
    INSERT INTO workspaces_new
    SELECT id, name, description, strftime('%Y', COALESCE(created_at, '2026-01-01')) AS fiscal_year,
           owner_id, is_archived,
           COALESCE(settings, '{}'), COALESCE(email_whitelist, '[]'),
           bank_account_id, created_at, updated_at
    FROM workspaces
"""


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS workspaces_new (
            id TEXT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            owner_id VARCHAR(36) NOT NULL REFERENCES users(id),
            is_archived BOOLEAN NOT NULL DEFAULT 0,
            settings JSON NOT NULL DEFAULT '{}',
            email_whitelist JSON NOT NULL DEFAULT '[]',
            bank_account_id VARCHAR(36) REFERENCES bank_accounts(id) ON DELETE SET NULL,
            created_at DATETIME,
            updated_at DATETIME,
            PRIMARY KEY (id),
            UNIQUE (owner_id, name)
        )
    """)
    op.execute(INSERT_UPGRADE)
    op.execute("DROP TABLE workspaces")
    op.execute("ALTER TABLE workspaces_new RENAME TO workspaces")
    op.execute("CREATE INDEX ix_workspaces_name ON workspaces (name)")
    op.execute("CREATE INDEX ix_workspaces_owner_id ON workspaces (owner_id)")
    op.execute("CREATE INDEX ix_workspaces_bank_account_id ON workspaces (bank_account_id)")


def downgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS workspaces_new (
            id TEXT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            fiscal_year INTEGER NOT NULL,
            owner_id VARCHAR(36) NOT NULL REFERENCES users(id),
            is_archived BOOLEAN NOT NULL DEFAULT 0,
            settings JSON NOT NULL DEFAULT '{}',
            email_whitelist JSON NOT NULL DEFAULT '[]',
            bank_account_id VARCHAR(36) REFERENCES bank_accounts(id) ON DELETE SET NULL,
            created_at DATETIME,
            updated_at DATETIME,
            PRIMARY KEY (id),
            UNIQUE (owner_id, name, fiscal_year)
        )
    """)
    op.execute(INSERT_DOWNGRADE)
    op.execute("DROP TABLE workspaces")
    op.execute("ALTER TABLE workspaces_new RENAME TO workspaces")
    op.execute("CREATE INDEX ix_workspaces_name ON workspaces (name)")
    op.execute("CREATE INDEX ix_workspaces_owner_id ON workspaces (owner_id)")
    op.execute("CREATE INDEX ix_workspaces_bank_account_id ON workspaces (bank_account_id)")
