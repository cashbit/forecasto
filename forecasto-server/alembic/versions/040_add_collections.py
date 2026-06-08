"""Add collections and collection_documents tables.

Revision ID: 040
Revises: 039
Create Date: 2026-06-08

Schema-less NoSQL-like document store per workspace. A `Collection` holds the
LLM handler contract (instructions + extraction schema); `collection_documents`
holds arbitrary JSON payloads, with quarantine modeled as rows whose
`collection_id IS NULL` and `status = 'quarantined'`.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("handler_instructions", sa.Text, nullable=True),
        sa.Column("extraction_schema", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("classification_hints", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("document_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("workspace_id", "slug", name="uq_collection_workspace_slug"),
    )
    op.create_index("ix_collections_workspace_id", "collections", ["workspace_id"])
    op.create_index("ix_collections_slug", "collections", ["slug"])

    op.create_table(
        "collection_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "collection_id",
            sa.String(36),
            sa.ForeignKey("collections.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("data", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("source_filename", sa.String(255), nullable=True),
        sa.Column("source_hash", sa.String(64), nullable=True),
        sa.Column("source_origin", sa.String(20), nullable=False, server_default="mcp"),
        sa.Column("document_type", sa.String(50), nullable=True),
        sa.Column("quarantine_reason", sa.Text, nullable=True),
        sa.Column("classification_confidence", sa.Float, nullable=True),
        sa.Column("inbox_item_id", sa.String(36), sa.ForeignKey("inbox_items.id"), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_cd_workspace_id", "collection_documents", ["workspace_id"])
    op.create_index("ix_cd_collection_id", "collection_documents", ["collection_id"])
    op.create_index("ix_cd_status", "collection_documents", ["status"])
    op.create_index("ix_cd_source_hash", "collection_documents", ["source_hash"])
    op.create_index(
        "ix_cd_ws_collection_status",
        "collection_documents",
        ["workspace_id", "collection_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_cd_ws_collection_status", table_name="collection_documents")
    op.drop_index("ix_cd_source_hash", table_name="collection_documents")
    op.drop_index("ix_cd_status", table_name="collection_documents")
    op.drop_index("ix_cd_collection_id", table_name="collection_documents")
    op.drop_index("ix_cd_workspace_id", table_name="collection_documents")
    op.drop_table("collection_documents")

    op.drop_index("ix_collections_slug", table_name="collections")
    op.drop_index("ix_collections_workspace_id", table_name="collections")
    op.drop_table("collections")
