"""Agente-zero run model — tracks each LLM analysis batch for billing/audit."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin


class AgentZeroRun(Base, UUIDMixin, TimestampMixin):
    """One row per Agente-zero LLM batch (scheduler pass or manual run)."""

    __tablename__ = "agent_zero_runs"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="completed"
    )  # "completed" | "failed"
    trigger: Mapped[str] = mapped_column(
        String(20), nullable=False, default="scheduler"
    )  # "scheduler" | "manual"

    # LLM usage
    llm_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_cost_eur: Mapped[float] = mapped_column(Float, default=0.0)
    records_analyzed: Mapped[int] = mapped_column(Integer, default=0)

    error_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Billing aggregation (YYYY-MM)
    billing_month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    workspace = relationship("Workspace", foreign_keys=[workspace_id])
