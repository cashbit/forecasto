"""Registration code models for controlled user registration."""

from __future__ import annotations

import secrets
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from forecasto.models.user import User


def generate_registration_code() -> str:
    """Generate a unique registration code in format XXXX-XXXX-XXXX.

    Uses alphabet without ambiguous characters: A-Z excluding O, I, L and 2-9 excluding 0, 1.
    This generates 12 characters to distinguish from workspace invite codes (9 chars).
    """
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(12))
    return f"{code[:4]}-{code[4:8]}-{code[8:12]}"


class RegistrationCodeBatch(Base, UUIDMixin, TimestampMixin):
    """Batch of registration codes created together."""

    __tablename__ = "registration_code_batches"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_id])
    codes: Mapped[list["RegistrationCode"]] = relationship(
        "RegistrationCode", back_populates="batch", cascade="all, delete-orphan"
    )


class RegistrationCode(Base, UUIDMixin):
    """Individual registration code for user signup."""

    __tablename__ = "registration_codes"

    code: Mapped[str] = mapped_column(
        String(14), unique=True, nullable=False, index=True, default=generate_registration_code
    )
    batch_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("registration_code_batches.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    used_by_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    batch: Mapped["RegistrationCodeBatch"] = relationship(
        "RegistrationCodeBatch", back_populates="codes"
    )
    used_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[used_by_id])
