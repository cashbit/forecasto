"""Numerator models — per-workspace consecutive document numbering.

A `Numerator` issues consecutive integers for documents (offerte, fatture,
protocollo, ordini…). Issuance is fully algorithmic and two-phase:

  * RESERVE returns a *candidate* number + a token + `pending_expires_at`; the
    number is not yet consumed. The single pending reservation lives embedded
    on the row (`pending_*`), which makes claiming it a single atomic
    conditional UPDATE.
  * CONFIRM (with the token, within the TTL) advances `last_value`, clears the
    pending fields and writes a `NumeratorEntry`. If the TTL lapses the
    candidate is released (no gaps) — expiry is handled lazily on next access.

A numerator with `confirm_ttl_seconds == 0` is single-phase: RESERVE consumes
the number immediately (no pending state ever stored).

Counters reset `never` / `yearly` / `monthly` per `reset_policy`, tracked via
`period_key` (`""` / `"YYYY"` / `"YYYY-MM"`).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from forecasto.models.workspace import Workspace


class Numerator(Base, UUIDMixin, TimestampMixin):
    """A consecutive document-number sequence scoped to a workspace."""

    __tablename__ = "numerators"
    __table_args__ = (
        UniqueConstraint("workspace_id", "key", name="uq_numerator_workspace_key"),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(50), nullable=False)  # machine slug, e.g. "offerte"
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # --- Rules (structured format) ---
    reset_policy: Mapped[str] = mapped_column(
        String(10), nullable=False, default="never"
    )  # never | yearly | monthly
    start_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    prefix: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    suffix: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    separator: Mapped[str] = mapped_column(String(10), nullable=False, default="/")
    padding: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # digits of the sequence
    include_year: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    include_month: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Issuance mode: >0 = two-phase reserve/confirm with this TTL; 0 = immediate issue.
    confirm_ttl_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    # --- Live counter state ---
    # last_value is NULL within a period => nothing issued yet => next = start_number.
    last_value: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    period_key: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    # --- Embedded single pending reservation (all NULL when none) ---
    pending_token: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    pending_value: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pending_period_key: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    pending_reserved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    pending_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="numerators")
    entries: Mapped[list["NumeratorEntry"]] = relationship(
        "NumeratorEntry", back_populates="numerator", cascade="all, delete-orphan"
    )


class NumeratorEntry(Base, UUIDMixin):
    """An append-only record of a confirmed (issued) number."""

    __tablename__ = "numerator_entries"
    __table_args__ = (
        # A number can never be physically recorded twice in the same period.
        UniqueConstraint("numerator_id", "period_key", "value", name="uq_numerator_entry_no_dup"),
    )

    numerator_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("numerators.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    formatted: Mapped[str] = mapped_column(String(255), nullable=False)
    period_key: Mapped[str] = mapped_column(String(7), nullable=False, default="")
    issued_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    reservation_token: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    numerator: Mapped["Numerator"] = relationship("Numerator", back_populates="entries")
