"""Add partner system: is_partner on users, partner_id on batches

Revision ID: 010_add_partner_system
Revises: 009_workspace_bank_account_direct
Create Date: 2026-02-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "010_add_partner_system"
down_revision: Union[str, None] = "009_workspace_bank_account_direct"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Recreate users table with is_partner field (SQLite pattern)
    conn.execute(
        sa.text(
            """
        CREATE TABLE users_new (
            email VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            invite_code VARCHAR(11) NOT NULL,
            email_verified BOOLEAN NOT NULL,
            last_login_at DATETIME,
            notification_preferences JSON NOT NULL,
            is_admin BOOLEAN NOT NULL DEFAULT 0,
            is_partner BOOLEAN NOT NULL DEFAULT 0,
            is_blocked BOOLEAN NOT NULL DEFAULT 0,
            blocked_at DATETIME,
            blocked_reason TEXT,
            registration_code_id VARCHAR(36),
            must_change_password BOOLEAN NOT NULL DEFAULT 0,
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE (email),
            UNIQUE (invite_code),
            FOREIGN KEY (registration_code_id) REFERENCES registration_codes (id) ON DELETE SET NULL
        )
    """
        )
    )

    conn.execute(
        sa.text(
            """
        INSERT INTO users_new (
            email, password_hash, name, invite_code, email_verified, last_login_at,
            notification_preferences, is_admin, is_partner, is_blocked, blocked_at, blocked_reason,
            registration_code_id, must_change_password, id, created_at, updated_at
        )
        SELECT
            email, password_hash, name, invite_code, email_verified, last_login_at,
            notification_preferences, is_admin, 0, is_blocked, blocked_at, blocked_reason,
            registration_code_id, must_change_password, id, created_at, updated_at
        FROM users
    """
        )
    )

    conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text("ALTER TABLE users_new RENAME TO users"))
    conn.execute(sa.text("CREATE INDEX ix_users_email ON users (email)"))
    conn.execute(sa.text("CREATE INDEX ix_users_invite_code ON users (invite_code)"))

    # 2. Recreate registration_code_batches with partner_id (SQLite pattern)
    conn.execute(
        sa.text(
            """
        CREATE TABLE registration_code_batches_new (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            created_by_id VARCHAR(36),
            partner_id VARCHAR(36),
            expires_at DATETIME,
            note TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            FOREIGN KEY (created_by_id) REFERENCES users (id) ON DELETE SET NULL,
            FOREIGN KEY (partner_id) REFERENCES users (id) ON DELETE SET NULL
        )
    """
        )
    )

    conn.execute(
        sa.text(
            """
        INSERT INTO registration_code_batches_new (
            id, name, created_by_id, partner_id, expires_at, note, created_at, updated_at
        )
        SELECT id, name, created_by_id, NULL, expires_at, note, created_at, updated_at
        FROM registration_code_batches
    """
        )
    )

    conn.execute(sa.text("DROP TABLE registration_code_batches"))
    conn.execute(
        sa.text(
            "ALTER TABLE registration_code_batches_new RENAME TO registration_code_batches"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()

    # 1. Remove partner_id from registration_code_batches
    # SQLite doesn't support DROP COLUMN before 3.35, recreate table
    conn.execute(
        sa.text(
            """
        CREATE TABLE registration_code_batches_new (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            created_by_id VARCHAR(36),
            expires_at DATETIME,
            note TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            FOREIGN KEY (created_by_id) REFERENCES users (id) ON DELETE SET NULL
        )
    """
        )
    )

    conn.execute(
        sa.text(
            """
        INSERT INTO registration_code_batches_new (
            id, name, created_by_id, expires_at, note, created_at, updated_at
        )
        SELECT id, name, created_by_id, expires_at, note, created_at, updated_at
        FROM registration_code_batches
    """
        )
    )

    conn.execute(sa.text("DROP TABLE registration_code_batches"))
    conn.execute(
        sa.text(
            "ALTER TABLE registration_code_batches_new RENAME TO registration_code_batches"
        )
    )

    # 2. Recreate users without is_partner
    conn.execute(
        sa.text(
            """
        CREATE TABLE users_new (
            email VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            invite_code VARCHAR(11) NOT NULL,
            email_verified BOOLEAN NOT NULL,
            last_login_at DATETIME,
            notification_preferences JSON NOT NULL,
            is_admin BOOLEAN NOT NULL DEFAULT 0,
            is_blocked BOOLEAN NOT NULL DEFAULT 0,
            blocked_at DATETIME,
            blocked_reason TEXT,
            registration_code_id VARCHAR(36),
            must_change_password BOOLEAN NOT NULL DEFAULT 0,
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE (email),
            UNIQUE (invite_code),
            FOREIGN KEY (registration_code_id) REFERENCES registration_codes (id) ON DELETE SET NULL
        )
    """
        )
    )

    conn.execute(
        sa.text(
            """
        INSERT INTO users_new (
            email, password_hash, name, invite_code, email_verified, last_login_at,
            notification_preferences, is_admin, is_blocked, blocked_at, blocked_reason,
            registration_code_id, must_change_password, id, created_at, updated_at
        )
        SELECT
            email, password_hash, name, invite_code, email_verified, last_login_at,
            notification_preferences, is_admin, is_blocked, blocked_at, blocked_reason,
            registration_code_id, must_change_password, id, created_at, updated_at
        FROM users
    """
        )
    )

    conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text("ALTER TABLE users_new RENAME TO users"))
    conn.execute(sa.text("CREATE INDEX ix_users_email ON users (email)"))
    conn.execute(sa.text("CREATE INDEX ix_users_invite_code ON users (invite_code)"))
