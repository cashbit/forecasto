"""Billing profile model."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy import Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from forecasto.models.user import User


class BillingProfile(Base, UUIDMixin, TimestampMixin):
    """Billing profile for company/subscription management."""

    __tablename__ = "billing_profiles"

    # Company info
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_form: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vat_number: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sdi_code: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    # Bank info
    iban: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    swift: Mapped[Optional[str]] = mapped_column(String(11), nullable=True)
    iban_holder: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Pricing
    setup_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    monthly_cost_first_year: Mapped[float] = mapped_column(
        Numeric(10, 2), default=0, nullable=False
    )
    monthly_cost_after_first_year: Mapped[float] = mapped_column(
        Numeric(10, 2), default=0, nullable=False
    )
    monthly_page_quota: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_package_cost: Mapped[float] = mapped_column(
        Numeric(10, 2), default=0, nullable=False
    )
    max_users: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    users: Mapped[list["User"]] = relationship(
        "User", back_populates="billing_profile"
    )
