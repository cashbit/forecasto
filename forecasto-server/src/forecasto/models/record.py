"""Record and version history models."""

from __future__ import annotations


from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin, generate_uuid

if TYPE_CHECKING:
    from forecasto.models.bank_account import BankAccount
    from forecasto.models.user import User
    from forecasto.models.workspace import Workspace

class Record(Base, UUIDMixin, TimestampMixin):
    """Financial record (budget, prospect, orders, actual)."""

    __tablename__ = "records"

    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    area: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # budget, prospect, orders, actual

    # Main record fields
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    account: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    reference: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date_cashflow: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    date_offer: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    vat: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    stage: Mapped[str] = mapped_column(String(50), nullable=False)
    owner: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    nextaction: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    transaction_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relations
    bank_account_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("bank_accounts.id"), nullable=True, index=True
    )

    # Project code (free text for grouping records)
    project_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    # Semantic classification
    classification: Mapped[dict] = mapped_column(JSON, default=dict)

    # Transfer history
    transfer_history: Mapped[list] = mapped_column(JSON, default=list)

    # Versioning for optimistic locking
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Audit fields
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    updated_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    # Soft delete
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    deleted_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="records")
    bank_account: Mapped[Optional["BankAccount"]] = relationship("BankAccount")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    updater: Mapped[Optional["User"]] = relationship("User", foreign_keys=[updated_by])
    versions: Mapped[list["RecordVersion"]] = relationship(
        "RecordVersion", back_populates="record", cascade="all, delete-orphan"
    )

class RecordVersion(Base):
    """Historical version of a record for audit trail."""

    __tablename__ = "record_versions"
    __table_args__ = (UniqueConstraint("record_id", "version", name="uq_record_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    record_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("records.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    changed_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    # session_id kept for backwards compatibility but without FK constraint
    session_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=True
    )
    change_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # create, update, delete, transfer, restore
    change_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    record: Mapped["Record"] = relationship("Record", back_populates="versions")
    user: Mapped[Optional["User"]] = relationship("User")
