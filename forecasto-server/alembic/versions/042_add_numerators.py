"""Add numerators and numerator_entries tables.

Revision ID: 042
Revises: 041
Create Date: 2026-06-10

Per-workspace consecutive document numbering. A `Numerator` carries the
formatting rules + reset policy and embeds the single pending reservation
(`pending_*`) so a reserve is one atomic conditional UPDATE. `numerator_entries`
is an append-only log of confirmed (issued) numbers, with a unique constraint
on (numerator_id, period_key, value) as a defense-in-depth invariant.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "numerators",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("reset_policy", sa.String(10), nullable=False, server_default="never"),
        sa.Column("start_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("prefix", sa.String(50), nullable=True),
        sa.Column("suffix", sa.String(50), nullable=True),
        sa.Column("separator", sa.String(10), nullable=False, server_default="/"),
        sa.Column("padding", sa.Integer, nullable=False, server_default="1"),
        sa.Column("include_year", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("include_month", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("confirm_ttl_seconds", sa.Integer, nullable=False, server_default="60"),
        sa.Column("last_value", sa.Integer, nullable=True),
        sa.Column("period_key", sa.String(7), nullable=True),
        sa.Column("pending_token", sa.String(36), nullable=True),
        sa.Column("pending_value", sa.Integer, nullable=True),
        sa.Column("pending_period_key", sa.String(7), nullable=True),
        sa.Column("pending_reserved_by", sa.String(36), nullable=True),
        sa.Column("pending_expires_at", sa.DateTime, nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("workspace_id", "key", name="uq_numerator_workspace_key"),
    )
    op.create_index("ix_numerators_workspace_id", "numerators", ["workspace_id"])

    op.create_table(
        "numerator_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "numerator_id",
            sa.String(36),
            sa.ForeignKey("numerators.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("workspace_id", sa.String(36), nullable=False),
        sa.Column("value", sa.Integer, nullable=False),
        sa.Column("formatted", sa.String(255), nullable=False),
        sa.Column("period_key", sa.String(7), nullable=False, server_default=""),
        sa.Column("issued_by", sa.String(36), nullable=True),
        sa.Column("issued_at", sa.DateTime, nullable=False),
        sa.Column("reservation_token", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("numerator_id", "period_key", "value", name="uq_numerator_entry_no_dup"),
    )
    op.create_index("ix_numerator_entries_numerator_id", "numerator_entries", ["numerator_id"])
    op.create_index("ix_numerator_entries_workspace_id", "numerator_entries", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_numerator_entries_workspace_id", table_name="numerator_entries")
    op.drop_index("ix_numerator_entries_numerator_id", table_name="numerator_entries")
    op.drop_table("numerator_entries")

    op.drop_index("ix_numerators_workspace_id", table_name="numerators")
    op.drop_table("numerators")
