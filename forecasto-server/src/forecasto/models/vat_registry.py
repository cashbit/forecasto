"""VAT Registry models — anagrafica partite IVA."""

from __future__ import annotations


from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin, generate_uuid

if TYPE_CHECKING:
    from forecasto.models.bank_account import BankAccount
    from forecasto.models.user import User
    from forecasto.models.workspace import Workspace


class VatRegistry(Base, UUIDMixin, TimestampMixin):
    """Anagrafica Partita IVA owned by a user, associable to multiple workspaces."""

    __tablename__ = "vat_registries"
    __table_args__ = (
        UniqueConstraint("owner_id", "vat_number", name="uq_vat_registry_owner_number"),
    )

    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vat_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    bank_account_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("bank_accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])
    bank_account: Mapped[Optional["BankAccount"]] = relationship(
        "BankAccount", foreign_keys=[bank_account_id]
    )
    balances: Mapped[list["VatBalance"]] = relationship(
        "VatBalance", back_populates="vat_registry", cascade="all, delete-orphan"
    )
    workspaces: Mapped[list["Workspace"]] = relationship(
        "Workspace", back_populates="vat_registry"
    )


class VatBalance(Base, UUIDMixin):
    """Monthly IVA balance snapshot for a VatRegistry."""

    __tablename__ = "vat_balances"
    __table_args__ = (
        UniqueConstraint("vat_registry_id", "month", name="uq_vat_balance_registry_month"),
    )

    vat_registry_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vat_registries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # "YYYY-MM"
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)  # +credit, -debit
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    vat_registry: Mapped["VatRegistry"] = relationship("VatRegistry", back_populates="balances")
