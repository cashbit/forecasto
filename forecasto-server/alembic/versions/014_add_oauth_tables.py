"""add oauth tables for MCP server

Revision ID: 014_add_oauth_tables
Revises: 013_add_seq_num
Create Date: 2026-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '014_add_oauth_tables'
down_revision: Union[str, None] = '013_add_seq_num'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tables may already exist if init_db() ran on a fresh DB before migration.
    # Use if_not_exists=True (Alembic 1.7+) to handle both cases safely.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'oauth_clients' not in existing_tables:
        op.create_table(
            'oauth_clients',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('client_id', sa.String(100), unique=True, nullable=False),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('redirect_uris', sa.JSON, nullable=False, server_default='[]'),
            sa.Column('trusted', sa.Boolean, nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime, nullable=False),
        )

    if 'oauth_authorization_codes' not in existing_tables:
        op.create_table(
            'oauth_authorization_codes',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('client_id', sa.String(100), nullable=False),
            sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('code_hash', sa.String(255), unique=True, nullable=False),
            sa.Column('redirect_uri', sa.Text, nullable=False),
            sa.Column('scope', sa.String(255), nullable=False, server_default='read write'),
            sa.Column('code_challenge', sa.String(255), nullable=True),
            sa.Column('code_challenge_method', sa.String(10), nullable=True),
            sa.Column('expires_at', sa.DateTime, nullable=False),
            sa.Column('used_at', sa.DateTime, nullable=True),
            sa.Column('created_at', sa.DateTime, nullable=False),
        )

    # Seed the forecasto-mcp trusted client (INSERT OR IGNORE to be idempotent)
    conn = op.get_bind()
    import uuid
    from datetime import datetime
    redirect_uris = '["https://app.forecasto.it/oauth/callback", "https://mcp.forecasto.it/oauth/callback", "http://localhost:3100/oauth/callback"]'
    conn.execute(
        sa.text(
            "INSERT OR IGNORE INTO oauth_clients (id, client_id, name, redirect_uris, trusted, created_at) "
            "VALUES (:id, :client_id, :name, :redirect_uris, :trusted, :created_at)"
        ),
        {
            "id": str(uuid.uuid4()),
            "client_id": "forecasto-mcp",
            "name": "Forecasto MCP Server",
            "redirect_uris": redirect_uris,
            "trusted": 1,
            "created_at": datetime.utcnow().isoformat(),
        }
    )
    # Update redirect_uris if the row already existed (idempotent)
    conn.execute(
        sa.text(
            "UPDATE oauth_clients SET redirect_uris = :redirect_uris "
            "WHERE client_id = 'forecasto-mcp'"
        ),
        {"redirect_uris": redirect_uris},
    )


def downgrade() -> None:
    op.drop_table('oauth_authorization_codes')
    op.drop_table('oauth_clients')
