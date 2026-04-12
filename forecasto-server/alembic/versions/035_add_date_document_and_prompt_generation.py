"""Add date_document to records, agent_prompt to users, and prompt_generation_jobs table.

Revision ID: 035
Revises: 034
"""

import sqlalchemy as sa
from alembic import op

revision = "035"
down_revision = "034"


def upgrade() -> None:
    # 1. Add date_document column to records
    op.add_column("records", sa.Column("date_document", sa.Date(), nullable=True))
    op.create_index("ix_records_date_document", "records", ["date_document"])

    # 2. Add agent_prompt column to users
    op.add_column("users", sa.Column("agent_prompt", sa.Text(), nullable=True))

    # 3. Create prompt_generation_jobs table
    op.create_table(
        "prompt_generation_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("llm_model", sa.String(100), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cost_eur", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("prompt_text", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("billing_month", sa.String(7), nullable=False),
        sa.Column("records_analyzed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_prompt_generation_jobs_user_id", "prompt_generation_jobs", ["user_id"])
    op.create_index("ix_prompt_generation_jobs_workspace_id", "prompt_generation_jobs", ["workspace_id"])
    op.create_index("ix_prompt_generation_jobs_billing_month", "prompt_generation_jobs", ["billing_month"])


def downgrade() -> None:
    op.drop_table("prompt_generation_jobs")
    op.drop_column("users", "agent_prompt")
    op.drop_index("ix_records_date_document", table_name="records")
    op.drop_column("records", "date_document")
