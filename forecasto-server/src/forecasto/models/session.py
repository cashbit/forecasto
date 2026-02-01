"""Session-related models for chat-like workflow."""

from __future__ import annotations


from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, UUIDMixin, generate_uuid

if TYPE_CHECKING:
    from forecasto.models.record import Record
    from forecasto.models.user import User
    from forecasto.models.workspace import Workspace

class Session(Base, UUIDMixin):
    """Work session similar to a chat conversation."""

    __tablename__ = "sessions"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="active", nullable=False, index=True
    )  # active, committed, discarded
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_activity: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    committed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    discarded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    commit_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changes_count: Mapped[int] = mapped_column(Integer, default=0)
    changes_summary: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {"created": 0, "updated": 0, "deleted": 0, "transferred": 0},
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="sessions")
    user: Mapped["User"] = relationship("User")
    messages: Mapped[list["SessionMessage"]] = relationship(
        "SessionMessage", back_populates="session", cascade="all, delete-orphan"
    )
    operations: Mapped[list["SessionOperation"]] = relationship(
        "SessionOperation", back_populates="session", cascade="all, delete-orphan"
    )
    record_locks: Mapped[list["SessionRecordLock"]] = relationship(
        "SessionRecordLock", back_populates="session", cascade="all, delete-orphan"
    )

class SessionMessage(Base, UUIDMixin):
    """Message in a session conversation."""

    __tablename__ = "session_messages"
    __table_args__ = (UniqueConstraint("session_id", "sequence", name="uq_message_session_sequence"),)

    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user, assistant, system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    session: Mapped["Session"] = relationship("Session", back_populates="messages")
    operations: Mapped[list["SessionOperation"]] = relationship(
        "SessionOperation", back_populates="message"
    )

class SessionOperation(Base):
    """Operation on records executed in a session."""

    __tablename__ = "session_operations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("session_messages.id"), nullable=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    operation_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # create, update, delete, transfer
    record_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("records.id"), nullable=False, index=True
    )
    area: Mapped[str] = mapped_column(String(50), nullable=False)
    before_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    after_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    from_area: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    to_area: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_undone: Mapped[bool] = mapped_column(Boolean, default=False)
    undone_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    session: Mapped["Session"] = relationship("Session", back_populates="operations")
    message: Mapped[Optional["SessionMessage"]] = relationship(
        "SessionMessage", back_populates="operations"
    )
    record: Mapped["Record"] = relationship("Record")

class SessionRecordLock(Base):
    """Lock on a record held by a session (draft changes)."""

    __tablename__ = "session_record_locks"
    __table_args__ = (UniqueConstraint("session_id", "record_id", name="uq_lock_session_record"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    record_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("records.id"), nullable=False, index=True
    )
    draft_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    base_version: Mapped[int] = mapped_column(Integer, nullable=False)
    locked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    session: Mapped["Session"] = relationship("Session", back_populates="record_locks")
    record: Mapped["Record"] = relationship("Record")
