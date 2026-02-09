"""Add billing system: partner_type on users, billing fields on registration_codes

Revision ID: 011_add_billing_system
Revises: 010_add_partner_system
Create Date: 2026-02-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "011_add_billing_system"
down_revision: Union[str, None] = "010_add_partner_system"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Recreate users table with partner_type field (SQLite pattern)
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
            partner_type VARCHAR(20),
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
            notification_preferences, is_admin, is_partner, partner_type, is_blocked, blocked_at, blocked_reason,
            registration_code_id, must_change_password, id, created_at, updated_at
        )
        SELECT
            email, password_hash, name, invite_code, email_verified, last_login_at,
            notification_preferences, is_admin, is_partner,
            CASE WHEN is_partner = 1 THEN 'billing_to_partner' ELSE NULL END,
            is_blocked, blocked_at, blocked_reason,
            registration_code_id, must_change_password, id, created_at, updated_at
        FROM users
    """
        )
    )

    conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text("ALTER TABLE users_new RENAME TO users"))
    conn.execute(sa.text("CREATE INDEX ix_users_email ON users (email)"))
    conn.execute(sa.text("CREATE INDEX ix_users_invite_code ON users (invite_code)"))

    # 2. Recreate registration_codes table with billing fields (SQLite pattern)
    conn.execute(
        sa.text(
            """
        CREATE TABLE registration_codes_new (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            code VARCHAR(14) NOT NULL,
            batch_id VARCHAR(36) NOT NULL,
            created_at DATETIME NOT NULL,
            expires_at DATETIME,
            used_at DATETIME,
            used_by_id VARCHAR(36),
            revoked_at DATETIME,
            invoiced BOOLEAN NOT NULL DEFAULT 0,
            invoiced_at DATETIME,
            invoiced_to VARCHAR(20),
            invoice_note VARCHAR(255),
            partner_fee_recognized BOOLEAN NOT NULL DEFAULT 0,
            partner_fee_recognized_at DATETIME,
            UNIQUE (code),
            FOREIGN KEY (batch_id) REFERENCES registration_code_batches (id) ON DELETE CASCADE,
            FOREIGN KEY (used_by_id) REFERENCES users (id) ON DELETE SET NULL
        )
    """
        )
    )

    conn.execute(
        sa.text(
            """
        INSERT INTO registration_codes_new (
            id, code, batch_id, created_at, expires_at, used_at, used_by_id, revoked_at,
            invoiced, invoiced_at, invoiced_to, invoice_note, partner_fee_recognized, partner_fee_recognized_at
        )
        SELECT
            id, code, batch_id, created_at, expires_at, used_at, used_by_id, revoked_at,
            0, NULL, NULL, NULL, 0, NULL
        FROM registration_codes
    """
        )
    )

    conn.execute(sa.text("DROP TABLE registration_codes"))
    conn.execute(sa.text("ALTER TABLE registration_codes_new RENAME TO registration_codes"))
    conn.execute(sa.text("CREATE UNIQUE INDEX ix_registration_codes_code ON registration_codes (code)"))


def downgrade() -> None:
    conn = op.get_bind()

    # 1. Remove billing fields from registration_codes
    conn.execute(
        sa.text(
            """
        CREATE TABLE registration_codes_new (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            code VARCHAR(14) NOT NULL,
            batch_id VARCHAR(36) NOT NULL,
            created_at DATETIME NOT NULL,
            expires_at DATETIME,
            used_at DATETIME,
            used_by_id VARCHAR(36),
            revoked_at DATETIME,
            UNIQUE (code),
            FOREIGN KEY (batch_id) REFERENCES registration_code_batches (id) ON DELETE CASCADE,
            FOREIGN KEY (used_by_id) REFERENCES users (id) ON DELETE SET NULL
        )
    """
        )
    )

    conn.execute(
        sa.text(
            """
        INSERT INTO registration_codes_new (
            id, code, batch_id, created_at, expires_at, used_at, used_by_id, revoked_at
        )
        SELECT id, code, batch_id, created_at, expires_at, used_at, used_by_id, revoked_at
        FROM registration_codes
    """
        )
    )

    conn.execute(sa.text("DROP TABLE registration_codes"))
    conn.execute(sa.text("ALTER TABLE registration_codes_new RENAME TO registration_codes"))
    conn.execute(sa.text("CREATE UNIQUE INDEX ix_registration_codes_code ON registration_codes (code)"))

    # 2. Remove partner_type from users
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
            notification_preferences, is_admin, is_partner, is_blocked, blocked_at, blocked_reason,
            registration_code_id, must_change_password, id, created_at, updated_at
        FROM users
    """
        )
    )

    conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text("ALTER TABLE users_new RENAME TO users"))
    conn.execute(sa.text("CREATE INDEX ix_users_email ON users (email)"))
    conn.execute(sa.text("CREATE INDEX ix_users_invite_code ON users (invite_code)"))
