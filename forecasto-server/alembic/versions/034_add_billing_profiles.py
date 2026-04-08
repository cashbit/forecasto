"""Add billing_profiles table and user billing fields.

Revision ID: 034
Revises: 033
"""

from alembic import op
import sqlalchemy as sa

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "billing_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("legal_form", sa.String(50), nullable=True),
        sa.Column("vat_number", sa.String(20), nullable=False),
        sa.Column("billing_address", sa.Text(), nullable=True),
        sa.Column("sdi_code", sa.String(7), nullable=True),
        sa.Column("iban", sa.String(34), nullable=True),
        sa.Column("swift", sa.String(11), nullable=True),
        sa.Column("iban_holder", sa.String(255), nullable=True),
        sa.Column("setup_cost", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("monthly_cost_first_year", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("monthly_cost_after_first_year", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("monthly_page_quota", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("page_package_cost", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("max_users", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.add_column(
        "users",
        sa.Column("billing_profile_id", sa.String(36), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("is_billing_master", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("max_records_free", sa.Integer(), nullable=False, server_default="100"),
    )
    # Note: FK constraint not added via ALTER for SQLite compatibility.
    # The FK is defined in the SQLAlchemy model.


def downgrade() -> None:
    op.drop_column("users", "max_records_free")
    op.drop_column("users", "is_billing_master")
    op.drop_column("users", "billing_profile_id")
    op.drop_table("billing_profiles")
