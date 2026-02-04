"""Workspace-related models."""

from __future__ import annotations


from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin, generate_uuid

if TYPE_CHECKING:
    from forecasto.models.bank_account import BankAccount
    from forecasto.models.project import Project
    from forecasto.models.record import Record
    from forecasto.models.session import Session
    from forecasto.models.user import User

class Workspace(Base, UUIDMixin, TimestampMixin):
    """Workspace containing financial data for a fiscal year."""

    __tablename__ = "workspaces"
    __table_args__ = (UniqueConstraint("name", "fiscal_year", name="uq_workspace_name_year"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    settings: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "session_idle_timeout_minutes": 30,
            "session_expire_timeout_hours": 4,
            "session_cleanup_days": 7,
        },
    )
    email_whitelist: Mapped[list] = mapped_column(JSON, default=list)

    # Relationships
    owner: Mapped["User"] = relationship("User")
    members: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="workspace", cascade="all, delete-orphan"
    )
    records: Mapped[list["Record"]] = relationship(
        "Record", back_populates="workspace", cascade="all, delete-orphan"
    )
    projects: Mapped[list["Project"]] = relationship(
        "Project", back_populates="workspace", cascade="all, delete-orphan"
    )
    bank_accounts: Mapped[list["BankAccount"]] = relationship(
        "BankAccount", back_populates="workspace", cascade="all, delete-orphan"
    )
    invitations: Mapped[list["Invitation"]] = relationship(
        "Invitation", back_populates="workspace", cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["ApiKey"]] = relationship(
        "ApiKey", back_populates="workspace", cascade="all, delete-orphan"
    )

class WorkspaceMember(Base, UUIDMixin):
    """Association between users and workspaces with role and permissions."""

    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_member_workspace_user"),)

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # owner, admin, member, viewer
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    area_permissions: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "actual": "write",
            "orders": "write",
            "prospect": "write",
            "budget": "write",
        },
    )
    can_view_in_consolidated_cashflow: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="workspace_memberships")

class Invitation(Base, UUIDMixin):
    """Pending invitation to join a workspace."""

    __tablename__ = "invitations"
    __table_args__ = (UniqueConstraint("workspace_id", "email", name="uq_invitation_workspace_email"),)

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    invited_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), default="member")
    area_permissions: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "actual": "write",
            "orders": "write",
            "prospect": "write",
            "budget": "write",
        },
    )
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="invitations")
    inviter: Mapped["User"] = relationship("User")

class ApiKey(Base, UUIDMixin):
    """API key for M2M integrations."""

    __tablename__ = "api_keys"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    permissions: Mapped[list] = mapped_column(JSON, default=lambda: ["read", "write"])
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="api_keys")
