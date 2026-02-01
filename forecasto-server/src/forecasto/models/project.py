"""Project and phase models."""

from __future__ import annotations


from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin, generate_uuid

if TYPE_CHECKING:
    from forecasto.models.workspace import Workspace

class Project(Base, UUIDMixin, TimestampMixin):
    """Project or contract for grouping records."""

    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("workspace_id", "code", name="uq_project_workspace_code"),)

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    expected_revenue: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    expected_costs: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    expected_margin: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="draft", nullable=False, index=True
    )  # draft, active, won, lost, completed, on_hold
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="projects")
    phases: Mapped[list["ProjectPhase"]] = relationship(
        "ProjectPhase", back_populates="project", cascade="all, delete-orphan"
    )

class ProjectPhase(Base):
    """Phase of a project."""

    __tablename__ = "project_phases"
    __table_args__ = (UniqueConstraint("project_id", "sequence", name="uq_phase_project_sequence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    current_area: Mapped[str] = mapped_column(
        String(50), default="prospect", nullable=False, index=True
    )  # budget, prospect, orders, actual
    expected_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expected_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    actual_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expected_revenue: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    expected_costs: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="phases")
