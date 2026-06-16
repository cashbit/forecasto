"""Add Agente-zero: record insight columns + agent_zero_runs table.

Revision ID: 044
Revises: 043
Create Date: 2026-06-15

Incremental, change-driven note analysis. Each record caches its derived
insights (`agent_insights`) plus a hash of the analyzed fields
(`agent_source_hash`) and the analysis timestamp (`agent_analyzed_at`).
`agent_zero_runs` logs each LLM batch for the "Consumo AI" page.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("records", sa.Column("agent_insights", sa.JSON(), nullable=True))
    op.add_column("records", sa.Column("agent_source_hash", sa.String(64), nullable=True))
    op.add_column("records", sa.Column("agent_analyzed_at", sa.DateTime(), nullable=True))

    op.create_table(
        "agent_zero_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("trigger", sa.String(20), nullable=False, server_default="scheduler"),
        sa.Column("llm_model", sa.String(100), nullable=True),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_cost_eur", sa.Float, nullable=False, server_default="0"),
        sa.Column("records_analyzed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error_message", sa.String(500), nullable=True),
        sa.Column("billing_month", sa.String(7), nullable=False),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_agent_zero_runs_workspace_id", "agent_zero_runs", ["workspace_id"])
    op.create_index("ix_agent_zero_runs_billing_month", "agent_zero_runs", ["billing_month"])


def downgrade() -> None:
    op.drop_index("ix_agent_zero_runs_billing_month", table_name="agent_zero_runs")
    op.drop_index("ix_agent_zero_runs_workspace_id", table_name="agent_zero_runs")
    op.drop_table("agent_zero_runs")

    op.drop_column("records", "agent_analyzed_at")
    op.drop_column("records", "agent_source_hash")
    op.drop_column("records", "agent_insights")
