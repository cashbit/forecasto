"""Add document processing jobs, usage records, and LLM pricing.

Revision ID: 031
Revises: 030
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa
from forecasto.models.base import generate_uuid

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Document processing jobs
    op.create_table(
        "document_processing_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("source_filename", sa.String(255), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("file_size_bytes", sa.Integer, nullable=False),
        sa.Column("file_content_type", sa.String(100), nullable=False),
        sa.Column("file_storage_path", sa.Text, nullable=False),
        sa.Column("upload_source", sa.String(20), nullable=False),
        sa.Column("uploaded_by_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("llm_model", sa.String(100), nullable=False),
        sa.Column("inbox_item_id", sa.String(36), sa.ForeignKey("inbox_items.id"), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_dpj_workspace_id", "document_processing_jobs", ["workspace_id"])
    op.create_index("ix_dpj_status", "document_processing_jobs", ["status"])

    # Usage records
    op.create_table(
        "usage_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("document_processing_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("llm_provider", sa.String(50), nullable=False),
        sa.Column("llm_model", sa.String(100), nullable=False),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cache_creation_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cache_read_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("input_cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("output_cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("total_cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("billed_cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("multiplier", sa.Float, nullable=False, server_default="2.0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_ur_workspace_id", "usage_records", ["workspace_id"])
    op.create_index("ix_ur_job_id", "usage_records", ["job_id"])

    # LLM Pricing configs
    op.create_table(
        "llm_pricing_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("model_name", sa.String(100), unique=True, nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("input_price_per_mtok", sa.Float, nullable=False),
        sa.Column("output_price_per_mtok", sa.Float, nullable=False),
        sa.Column("multiplier", sa.Float, nullable=False, server_default="2.0"),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )

    # Seed default pricing
    from datetime import datetime
    now = datetime.utcnow()
    op.bulk_insert(
        sa.table(
            "llm_pricing_configs",
            sa.column("id", sa.String),
            sa.column("model_name", sa.String),
            sa.column("display_name", sa.String),
            sa.column("input_price_per_mtok", sa.Float),
            sa.column("output_price_per_mtok", sa.Float),
            sa.column("multiplier", sa.Float),
            sa.column("is_default", sa.Boolean),
            sa.column("is_active", sa.Boolean),
            sa.column("created_at", sa.DateTime),
            sa.column("updated_at", sa.DateTime),
        ),
        [
            {
                "id": generate_uuid(),
                "model_name": "claude-sonnet-4-6",
                "display_name": "Claude Sonnet 4.6",
                "input_price_per_mtok": 3.0,
                "output_price_per_mtok": 15.0,
                "multiplier": 2.0,
                "is_default": True,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": generate_uuid(),
                "model_name": "claude-haiku-4-5-20251001",
                "display_name": "Claude Haiku 4.5",
                "input_price_per_mtok": 0.80,
                "output_price_per_mtok": 4.0,
                "multiplier": 2.0,
                "is_default": False,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("llm_pricing_configs")
    op.drop_index("ix_ur_job_id", table_name="usage_records")
    op.drop_index("ix_ur_workspace_id", table_name="usage_records")
    op.drop_table("usage_records")
    op.drop_index("ix_dpj_status", table_name="document_processing_jobs")
    op.drop_index("ix_dpj_workspace_id", table_name="document_processing_jobs")
    op.drop_table("document_processing_jobs")
