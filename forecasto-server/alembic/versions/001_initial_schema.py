"""Initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-01-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email_verified", sa.Boolean(), default=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("notification_preferences", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_users_email", "users", ["email"])

    # Refresh tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
    )
    op.create_index("idx_refresh_tokens_user", "refresh_tokens", ["user_id"])

    # Email verification tokens
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
    )

    # Workspaces
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_archived", sa.Boolean(), default=False),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("email_whitelist", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("name", "fiscal_year", name="uq_workspace_name_year"),
    )
    op.create_index("idx_workspaces_owner", "workspaces", ["owner_id"])
    op.create_index("idx_workspaces_name", "workspaces", ["name"])

    # Workspace members
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.Column("area_permissions", sa.JSON(), nullable=False),
        sa.Column("can_view_in_consolidated_cashflow", sa.Boolean(), default=True),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_member_workspace_user"),
    )
    op.create_index("idx_workspace_members_workspace", "workspace_members", ["workspace_id"])
    op.create_index("idx_workspace_members_user", "workspace_members", ["user_id"])

    # Invitations
    op.create_table(
        "invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invited_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), default="member"),
        sa.Column("area_permissions", sa.JSON(), nullable=True),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("workspace_id", "email", name="uq_invitation_workspace_email"),
    )
    op.create_index("idx_invitations_email", "invitations", ["email"])

    # API keys
    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("permissions", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_api_keys_workspace", "api_keys", ["workspace_id"])

    # Bank accounts
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("iban", sa.String(34), nullable=True),
        sa.Column("bic_swift", sa.String(11), nullable=True),
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("currency", sa.String(3), default="EUR"),
        sa.Column("credit_limit", sa.Numeric(15, 2), default=0),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("is_default", sa.Boolean(), default=False),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("workspace_id", "iban", name="uq_bank_workspace_iban"),
    )
    op.create_index("idx_bank_accounts_workspace", "bank_accounts", ["workspace_id"])

    # Bank account balances
    op.create_table(
        "bank_account_balances",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("bank_account_id", sa.String(36), sa.ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("balance_date", sa.Date(), nullable=False),
        sa.Column("balance", sa.Numeric(15, 2), nullable=False),
        sa.Column("source", sa.String(50), default="manual"),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("recorded_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.UniqueConstraint("bank_account_id", "balance_date", name="uq_balance_account_date"),
    )
    op.create_index("idx_bank_balances_account", "bank_account_balances", ["bank_account_id"])
    op.create_index("idx_bank_balances_date", "bank_account_balances", ["balance_date"])

    # Projects
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("customer_ref", sa.String(255), nullable=True),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("expected_revenue", sa.Numeric(15, 2), nullable=True),
        sa.Column("expected_costs", sa.Numeric(15, 2), nullable=True),
        sa.Column("expected_margin", sa.Numeric(15, 2), nullable=True),
        sa.Column("status", sa.String(50), default="draft"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("workspace_id", "code", name="uq_project_workspace_code"),
    )
    op.create_index("idx_projects_workspace", "projects", ["workspace_id"])
    op.create_index("idx_projects_status", "projects", ["workspace_id", "status"])

    # Project phases
    op.create_table(
        "project_phases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("current_area", sa.String(50), default="prospect"),
        sa.Column("expected_start", sa.Date(), nullable=True),
        sa.Column("expected_end", sa.Date(), nullable=True),
        sa.Column("actual_start", sa.Date(), nullable=True),
        sa.Column("actual_end", sa.Date(), nullable=True),
        sa.Column("expected_revenue", sa.Numeric(15, 2), nullable=True),
        sa.Column("expected_costs", sa.Numeric(15, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("project_id", "sequence", name="uq_phase_project_sequence"),
    )
    op.create_index("idx_project_phases_project", "project_phases", ["project_id"])

    # Records
    op.create_table(
        "records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("area", sa.String(50), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("account", sa.String(255), nullable=False),
        sa.Column("reference", sa.String(255), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("date_cashflow", sa.Date(), nullable=False),
        sa.Column("date_offer", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("vat", sa.Numeric(15, 2), default=0),
        sa.Column("total", sa.Numeric(15, 2), nullable=False),
        sa.Column("stage", sa.String(50), nullable=False),
        sa.Column("transaction_id", sa.String(255), nullable=True),
        sa.Column("bank_account_id", sa.String(36), sa.ForeignKey("bank_accounts.id"), nullable=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("phase_id", sa.String(36), sa.ForeignKey("project_phases.id"), nullable=True),
        sa.Column("classification", sa.JSON(), nullable=True),
        sa.Column("transfer_history", sa.JSON(), nullable=True),
        sa.Column("version", sa.Integer(), default=1),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_records_workspace", "records", ["workspace_id"])
    op.create_index("idx_records_workspace_area", "records", ["workspace_id", "area"])
    op.create_index("idx_records_date_cashflow", "records", ["date_cashflow"])
    op.create_index("idx_records_account", "records", ["account"])
    op.create_index("idx_records_reference", "records", ["reference"])
    op.create_index("idx_records_project", "records", ["project_id"])
    op.create_index("idx_records_bank_account", "records", ["bank_account_id"])

    # Sessions
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_activity", sa.DateTime(), nullable=False),
        sa.Column("committed_at", sa.DateTime(), nullable=True),
        sa.Column("discarded_at", sa.DateTime(), nullable=True),
        sa.Column("commit_message", sa.Text(), nullable=True),
        sa.Column("changes_count", sa.Integer(), default=0),
        sa.Column("changes_summary", sa.JSON(), nullable=True),
    )
    op.create_index("idx_sessions_workspace", "sessions", ["workspace_id"])
    op.create_index("idx_sessions_user", "sessions", ["user_id"])
    op.create_index("idx_sessions_status", "sessions", ["status"])

    # Session messages
    op.create_table(
        "session_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("session_id", "sequence", name="uq_message_session_sequence"),
    )
    op.create_index("idx_session_messages_session", "session_messages", ["session_id"])

    # Session operations
    op.create_table(
        "session_operations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("session_messages.id"), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("operation_type", sa.String(20), nullable=False),
        sa.Column("record_id", sa.String(36), sa.ForeignKey("records.id"), nullable=False),
        sa.Column("area", sa.String(50), nullable=False),
        sa.Column("before_snapshot", sa.JSON(), nullable=True),
        sa.Column("after_snapshot", sa.JSON(), nullable=False),
        sa.Column("from_area", sa.String(50), nullable=True),
        sa.Column("to_area", sa.String(50), nullable=True),
        sa.Column("is_undone", sa.Boolean(), default=False),
        sa.Column("undone_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_session_operations_session", "session_operations", ["session_id"])
    op.create_index("idx_session_operations_record", "session_operations", ["record_id"])

    # Session record locks
    op.create_table(
        "session_record_locks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("record_id", sa.String(36), sa.ForeignKey("records.id"), nullable=False),
        sa.Column("draft_snapshot", sa.JSON(), nullable=False),
        sa.Column("base_version", sa.Integer(), nullable=False),
        sa.Column("locked_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("session_id", "record_id", name="uq_lock_session_record"),
    )
    op.create_index("idx_session_locks_session", "session_record_locks", ["session_id"])
    op.create_index("idx_session_locks_record", "session_record_locks", ["record_id"])

    # Record versions
    op.create_table(
        "record_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("record_id", sa.String(36), sa.ForeignKey("records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("changed_at", sa.DateTime(), nullable=False),
        sa.Column("changed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id"), nullable=True),
        sa.Column("change_type", sa.String(50), nullable=False),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.UniqueConstraint("record_id", "version", name="uq_record_version"),
    )
    op.create_index("idx_record_versions_record", "record_versions", ["record_id"])
    op.create_index("idx_record_versions_session", "record_versions", ["session_id"])

    # Audit log
    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", sa.String(255), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("success", sa.Boolean(), default=True),
        sa.Column("error_code", sa.String(50), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index("idx_audit_log_timestamp", "audit_log", ["timestamp"])
    op.create_index("idx_audit_log_user", "audit_log", ["user_id"])
    op.create_index("idx_audit_log_workspace", "audit_log", ["workspace_id"])
    op.create_index("idx_audit_log_action", "audit_log", ["action"])


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("record_versions")
    op.drop_table("session_record_locks")
    op.drop_table("session_operations")
    op.drop_table("session_messages")
    op.drop_table("sessions")
    op.drop_table("records")
    op.drop_table("project_phases")
    op.drop_table("projects")
    op.drop_table("bank_account_balances")
    op.drop_table("bank_accounts")
    op.drop_table("api_keys")
    op.drop_table("invitations")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")
    op.drop_table("email_verification_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
