"""AgentToken model — user-scoped personal access token for Forecasto Agent."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from forecasto.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from forecasto.models.user import User


class AgentToken(Base, UUIDMixin, TimestampMixin):
    """Personal access token for the Forecasto Agent daemon.

    Unlike ApiKey (which is workspace-scoped), AgentToken is user-scoped:
    it grants access to all workspaces the user belongs to.
    Format: at_<32 hex bytes>
    """

    __tablename__ = "agent_tokens"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="agent_tokens")
