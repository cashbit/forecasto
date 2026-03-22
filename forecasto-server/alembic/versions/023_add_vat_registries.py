"""Add vat_registries and vat_balances tables, FK on workspaces.

Revision ID: 023_add_vat_registries
Revises: 022_add_vat_month
Create Date: 2026-03-21
"""

from typing import Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "023_add_vat_registries"
down_revision: Union[str, None] = "022_add_vat_month"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # 1. Create vat_registries table
    op.create_table(
        "vat_registries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("vat_number", sa.String(20), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("owner_id", "vat_number", name="uq_vat_registry_owner_number"),
    )

    # 2. Create vat_balances table
    op.create_table(
        "vat_balances",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "vat_registry_id",
            sa.String(36),
            sa.ForeignKey("vat_registries.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("vat_registry_id", "month", name="uq_vat_balance_registry_month"),
    )

    # 3. Add vat_registry_id column to workspaces (no FK constraint for SQLite compat)
    op.add_column(
        "workspaces",
        sa.Column("vat_registry_id", sa.String(36), nullable=True),
    )

    # 4. Data migration: create vat_registries from existing workspace.settings.vat_number
    conn = op.get_bind()

    # Find all workspaces that have a vat_number in their JSON settings
    rows = conn.execute(
        sa.text(
            "SELECT id, owner_id, json_extract(settings, '$.vat_number') AS vat_number "
            "FROM workspaces "
            "WHERE json_extract(settings, '$.vat_number') IS NOT NULL "
            "AND json_extract(settings, '$.vat_number') != ''"
        )
    ).fetchall()

    # Track created registries to avoid duplicates
    created = {}  # (owner_id, vat_number) -> registry_id
    for row in rows:
        workspace_id = row[0]
        owner_id = row[1]
        vat_number = row[2]

        key = (owner_id, vat_number)
        if key not in created:
            registry_id = str(uuid.uuid4())
            conn.execute(
                sa.text(
                    "INSERT INTO vat_registries (id, owner_id, name, vat_number, created_at, updated_at) "
                    "VALUES (:id, :owner_id, :name, :vat_number, datetime('now'), datetime('now'))"
                ),
                {"id": registry_id, "owner_id": owner_id, "name": vat_number, "vat_number": vat_number},
            )
            created[key] = registry_id

        # Link workspace to registry
        conn.execute(
            sa.text("UPDATE workspaces SET vat_registry_id = :reg_id WHERE id = :ws_id"),
            {"reg_id": created[key], "ws_id": workspace_id},
        )


def downgrade() -> None:
    op.drop_column("workspaces", "vat_registry_id")
    op.drop_table("vat_balances")
    op.drop_table("vat_registries")
