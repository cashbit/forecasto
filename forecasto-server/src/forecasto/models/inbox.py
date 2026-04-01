"""InboxItem model — document processing queue from Forecasto Agent."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from forecasto.models.workspace import Workspace


class InboxItem(Base, UUIDMixin, TimestampMixin):
    """A document processed by the Forecasto Agent, awaiting user confirmation."""

    __tablename__ = "inbox_items"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Status lifecycle: pending → confirmed | rejected
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)

    # Source file info (local path on the agent machine)
    source_path: Mapped[str] = mapped_column(Text, nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA256
    source_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # LLM metadata
    llm_provider: Mapped[str] = mapped_column(String(50), nullable=False)  # anthropic | ollama
    llm_model: Mapped[str] = mapped_column(String(100), nullable=False)
    agent_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # The extracted record suggestions (list of dicts, editable by user before confirm)
    extracted_data: Mapped[list] = mapped_column(JSON, default=list)

    # IDs of Record rows created when user confirms
    confirmed_record_ids: Mapped[list] = mapped_column(JSON, default=list)

    # Document classification (invoice, quote, bank_statement, wire_transfer, receipt, credit_note, other)
    document_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Pre-search reconciliation candidates from agent
    reconciliation_matches: Mapped[list] = mapped_column(JSON, default=list)

    # Soft delete
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="inbox_items")
