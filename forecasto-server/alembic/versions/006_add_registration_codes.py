"""Add registration codes system for controlled user registration

Revision ID: 006_registration_codes
Revises: 005_invite_code
Create Date: 2026-02-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "006_registration_codes"
down_revision: Union[str, None] = "005_invite_code"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Create registration_code_batches table
    op.create_table(
        "registration_code_batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_by_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=True),
        sa.Column("note", sa.Text, nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL"
        ),
    )

    # 2. Create registration_codes table
    op.create_table(
        "registration_codes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(14), nullable=False, unique=True),
        sa.Column("batch_id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=True),
        sa.Column("used_at", sa.DateTime, nullable=True),
        sa.Column("used_by_id", sa.String(36), nullable=True),
        sa.Column("revoked_at", sa.DateTime, nullable=True),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["registration_code_batches.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["used_by_id"], ["users.id"], ondelete="SET NULL"
        ),
    )
    op.create_index("ix_registration_codes_code", "registration_codes", ["code"])

    # 3. Add admin and blocked fields to users table
    # For SQLite, we need to recreate the table
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
            notification_preferences, 0, 0, NULL, NULL,
            NULL, 0, id, created_at, updated_at
        FROM users
    """
        )
    )

    conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text("ALTER TABLE users_new RENAME TO users"))
    conn.execute(sa.text("CREATE INDEX ix_users_email ON users (email)"))
    conn.execute(sa.text("CREATE INDEX ix_users_invite_code ON users (invite_code)"))


def downgrade() -> None:
    conn = op.get_bind()

    # 1. Recreate users table without new fields
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
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE (email),
            UNIQUE (invite_code)
        )
    """
        )
    )

    conn.execute(
        sa.text(
            """
        INSERT INTO users_new
        SELECT email, password_hash, name, invite_code, email_verified, last_login_at,
               notification_preferences, id, created_at, updated_at
        FROM users
    """
        )
    )

    conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text("ALTER TABLE users_new RENAME TO users"))
    conn.execute(sa.text("CREATE INDEX ix_users_email ON users (email)"))
    conn.execute(sa.text("CREATE INDEX ix_users_invite_code ON users (invite_code)"))

    # 2. Drop registration tables
    op.drop_table("registration_codes")
    op.drop_table("registration_code_batches")
