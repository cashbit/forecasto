"""Bank account models."""

from __future__ import annotations


from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin, generate_uuid

if TYPE_CHECKING:
    from forecasto.models.user import User
    from forecasto.models.workspace import Workspace

class BankAccount(Base, UUIDMixin, TimestampMixin):
    """Bank account owned by a user, associable to multiple workspaces."""

    __tablename__ = "bank_accounts"

    owner_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    settings: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {"color": "#1E88E5", "icon": "bank", "show_in_cashflow": True},
    )

    # Relationships
    owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[owner_id])
    workspaces: Mapped[list["Workspace"]] = relationship("Workspace", back_populates="bank_account")
    balances: Mapped[list["BankAccountBalance"]] = relationship(
        "BankAccountBalance", back_populates="bank_account", cascade="all, delete-orphan"
    )


class BankAccountBalance(Base):
    """Historical balance for a bank account."""

    __tablename__ = "bank_account_balances"
    __table_args__ = (
        UniqueConstraint("bank_account_id", "balance_date", name="uq_balance_account_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    bank_account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    balance_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    balance: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    source: Mapped[str] = mapped_column(
        String(50), default="manual", nullable=False
    )  # manual, import, calculated, bank_sync
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    recorded_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    bank_account: Mapped["BankAccount"] = relationship("BankAccount", back_populates="balances")
    user: Mapped[Optional["User"]] = relationship("User")
