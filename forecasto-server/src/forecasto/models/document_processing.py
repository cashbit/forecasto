"""Document processing models -- job tracking, usage metering, and LLM pricing."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from forecasto.models.inbox import InboxItem
    from forecasto.models.user import User
    from forecasto.models.workspace import Workspace


class DocumentProcessingJob(Base, UUIDMixin, TimestampMixin):
    """Tracks the lifecycle of a single document upload and processing."""

    __tablename__ = "document_processing_jobs"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued", index=True
    )  # queued -> processing -> completed -> failed

    # Source file info
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    file_content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_storage_path: Mapped[str] = mapped_column(Text, nullable=False)

    # Upload source
    upload_source: Mapped[str] = mapped_column(String(20), nullable=False)  # "agent" | "web"
    uploaded_by_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    # LLM config
    llm_model: Mapped[str] = mapped_column(String(100), nullable=False)

    # Result
    inbox_item_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("inbox_items.id"), nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timing
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    uploaded_by: Mapped[Optional["User"]] = relationship("User")
    inbox_item: Mapped[Optional["InboxItem"]] = relationship("InboxItem")
    usage_record: Mapped[Optional["UsageRecord"]] = relationship(
        "UsageRecord", back_populates="job", uselist=False
    )


class UsageRecord(Base, UUIDMixin, TimestampMixin):
    """Per-document token usage and cost tracking."""

    __tablename__ = "usage_records"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("document_processing_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    # LLM details
    llm_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    llm_model: Mapped[str] = mapped_column(String(100), nullable=False)

    # Token counts
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cache_creation_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Costs (USD)
    input_cost_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    output_cost_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_cost_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    billed_cost_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # total * multiplier
    multiplier: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)

    # Relationships
    job: Mapped["DocumentProcessingJob"] = relationship(
        "DocumentProcessingJob", back_populates="usage_record"
    )


class LLMPricingConfig(Base, UUIDMixin, TimestampMixin):
    """Admin-editable pricing table for LLM models."""

    __tablename__ = "llm_pricing_configs"

    model_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    input_price_per_mtok: Mapped[float] = mapped_column(Float, nullable=False)  # USD per million tokens
    output_price_per_mtok: Mapped[float] = mapped_column(Float, nullable=False)
    multiplier: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
