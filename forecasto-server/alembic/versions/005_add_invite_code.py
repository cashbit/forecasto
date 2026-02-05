"""Add invite_code to users and invitations

Revision ID: 005_invite_code
Revises: 004_granular_permissions
Create Date: 2026-02-05

"""
from typing import Sequence, Union
import secrets

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005_invite_code'
down_revision: Union[str, None] = '004_granular_permissions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def generate_invite_code() -> str:
    """Generate a unique invite code in format XXX-XXX-XXX."""
    alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    code = ''.join(secrets.choice(alphabet) for _ in range(9))
    return f"{code[:3]}-{code[3:6]}-{code[6:9]}"


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add invite_code column to users (nullable first)
    op.add_column(
        'users',
        sa.Column('invite_code', sa.String(11), nullable=True)
    )

    # 2. Generate unique codes for existing users
    result = conn.execute(sa.text("SELECT id FROM users"))
    users = result.fetchall()

    used_codes = set()
    for (user_id,) in users:
        code = generate_invite_code()
        while code in used_codes:
            code = generate_invite_code()
        used_codes.add(code)

        conn.execute(
            sa.text("UPDATE users SET invite_code = :code WHERE id = :id"),
            {"code": code, "id": user_id}
        )

    # 3. For SQLite, we need to recreate the table to add NOT NULL constraint
    # Create new users table with proper constraints
    conn.execute(sa.text("""
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
    """))

    conn.execute(sa.text("""
        INSERT INTO users_new
        SELECT email, password_hash, name, invite_code, email_verified, last_login_at,
               notification_preferences, id, created_at, updated_at
        FROM users
    """))

    conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text("ALTER TABLE users_new RENAME TO users"))
    conn.execute(sa.text("CREATE INDEX ix_users_email ON users (email)"))
    conn.execute(sa.text("CREATE INDEX ix_users_invite_code ON users (invite_code)"))

    # 4. Add invite_code column to invitations
    op.add_column(
        'invitations',
        sa.Column('invite_code', sa.String(11), nullable=True)
    )

    # 5. Migrate: for each invitation, look up user by email and set invite_code
    result = conn.execute(sa.text("""
        SELECT i.id, i.email, u.invite_code
        FROM invitations i
        LEFT JOIN users u ON LOWER(i.email) = LOWER(u.email)
    """))
    invitations = result.fetchall()

    for (inv_id, email, user_invite_code) in invitations:
        if user_invite_code:
            conn.execute(
                sa.text("UPDATE invitations SET invite_code = :code WHERE id = :id"),
                {"code": user_invite_code, "id": inv_id}
            )
        else:
            # User doesn't exist, delete orphan invitation
            conn.execute(
                sa.text("DELETE FROM invitations WHERE id = :id"),
                {"id": inv_id}
            )

    # 6. Recreate invitations table with new schema
    conn.execute(sa.text("""
        CREATE TABLE invitations_new (
            workspace_id VARCHAR(36) NOT NULL,
            invited_by VARCHAR(36) NOT NULL,
            invite_code VARCHAR(11) NOT NULL,
            role VARCHAR(50) NOT NULL,
            area_permissions JSON NOT NULL,
            granular_permissions JSON,
            token_hash VARCHAR(255) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            accepted_at DATETIME,
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            UNIQUE (workspace_id, invite_code),
            FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
            FOREIGN KEY (invited_by) REFERENCES users (id)
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO invitations_new
        SELECT workspace_id, invited_by, invite_code, role, area_permissions,
               granular_permissions, token_hash, created_at, expires_at, accepted_at, id
        FROM invitations
        WHERE invite_code IS NOT NULL
    """))

    conn.execute(sa.text("DROP TABLE invitations"))
    conn.execute(sa.text("ALTER TABLE invitations_new RENAME TO invitations"))
    conn.execute(sa.text("CREATE INDEX ix_invitations_invite_code ON invitations (invite_code)"))


def downgrade() -> None:
    conn = op.get_bind()

    # 1. Add email column back to invitations and migrate data
    conn.execute(sa.text("""
        CREATE TABLE invitations_new (
            workspace_id VARCHAR(36) NOT NULL,
            invited_by VARCHAR(36) NOT NULL,
            email VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL,
            area_permissions JSON NOT NULL,
            granular_permissions JSON,
            token_hash VARCHAR(255) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            accepted_at DATETIME,
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            UNIQUE (workspace_id, email),
            FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
            FOREIGN KEY (invited_by) REFERENCES users (id)
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO invitations_new
        SELECT i.workspace_id, i.invited_by, u.email, i.role, i.area_permissions,
               i.granular_permissions, i.token_hash, i.created_at, i.expires_at, i.accepted_at, i.id
        FROM invitations i
        JOIN users u ON i.invite_code = u.invite_code
    """))

    conn.execute(sa.text("DROP TABLE invitations"))
    conn.execute(sa.text("ALTER TABLE invitations_new RENAME TO invitations"))
    conn.execute(sa.text("CREATE INDEX ix_invitations_email ON invitations (email)"))

    # 2. Remove invite_code from users
    conn.execute(sa.text("""
        CREATE TABLE users_new (
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            email_verified BOOLEAN NOT NULL,
            last_login_at DATETIME,
            notification_preferences JSON NOT NULL,
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO users_new
        SELECT email, password_hash, name, email_verified, last_login_at,
               notification_preferences, id, created_at, updated_at
        FROM users
    """))

    conn.execute(sa.text("DROP TABLE users"))
    conn.execute(sa.text("ALTER TABLE users_new RENAME TO users"))
    conn.execute(sa.text("CREATE INDEX ix_users_email ON users (email)"))
