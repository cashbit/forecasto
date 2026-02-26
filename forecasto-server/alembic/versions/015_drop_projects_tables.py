"""drop projects and project_phases tables

Revision ID: 015_drop_projects_tables
Revises: 014_add_oauth_tables
Create Date: 2026-02-26

"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_drop_projects_tables"
down_revision: Union[str, None] = "014_add_oauth_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # project_phases has FK to projects — drop it first
    op.drop_table("project_phases")
    op.drop_table("projects")


def downgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "project_phases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
