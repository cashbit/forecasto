"""Partner schemas for partner-facing endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class PartnerCodeResponse(BaseModel):
    """Single code response for partner view."""

    id: str
    code: str
    created_at: datetime
    expires_at: datetime | None = None
    used_at: datetime | None = None
    used_by_name: str | None = None
    used_by_email: str | None = None
    revoked_at: datetime | None = None
    invoiced: bool = False
    invoiced_to: str | None = None


class PartnerBatchResponse(BaseModel):
    """Batch response for partner view with codes and statistics."""

    id: str
    name: str
    created_at: datetime
    expires_at: datetime | None = None
    note: str | None = None
    total_codes: int = 0
    used_codes: int = 0
    available_codes: int = 0
    codes: list[PartnerCodeResponse] = []
