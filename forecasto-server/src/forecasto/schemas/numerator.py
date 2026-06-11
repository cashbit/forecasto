"""Numerator schemas — per-workspace consecutive document numbering."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


ResetPolicy = Literal["never", "yearly", "monthly"]


# ---------------------------------------------------------------------------
# Numerator CRUD
# ---------------------------------------------------------------------------

class NumeratorCreate(BaseModel):
    """Create a new numerator. `key` is a machine slug unique per workspace."""

    key: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    reset_policy: ResetPolicy = "never"
    start_number: int = Field(default=1, ge=0)
    prefix: str | None = Field(default=None, max_length=50)
    suffix: str | None = Field(default=None, max_length=50)
    separator: str = Field(default="/", max_length=10)
    padding: int = Field(default=1, ge=1, le=12)
    include_year: bool = False
    include_month: bool = False
    # >0 = two-phase reserve/confirm with this TTL; 0 = immediate issue.
    confirm_ttl_seconds: int = Field(default=60, ge=0, le=3600)


class NumeratorUpdate(BaseModel):
    """Partial update of a numerator. `start_number` change is validated against
    the last issued value in the service."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    reset_policy: ResetPolicy | None = None
    start_number: int | None = Field(default=None, ge=0)
    prefix: str | None = Field(default=None, max_length=50)
    suffix: str | None = Field(default=None, max_length=50)
    separator: str | None = Field(default=None, max_length=10)
    padding: int | None = Field(default=None, ge=1, le=12)
    include_year: bool | None = None
    include_month: bool | None = None
    confirm_ttl_seconds: int | None = Field(default=None, ge=0, le=3600)


class NumeratorResponse(BaseModel):
    id: str
    workspace_id: str
    key: str
    name: str
    reset_policy: str
    start_number: int
    prefix: str | None
    suffix: str | None
    separator: str
    padding: int
    include_year: bool
    include_month: bool
    confirm_ttl_seconds: int
    last_value: int | None
    period_key: str | None
    # Pending reservation snapshot (advisory; expired ones are reclaimed lazily).
    pending_token: str | None
    pending_value: int | None
    pending_expires_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NumeratorEntryResponse(BaseModel):
    id: str
    numerator_id: str
    workspace_id: str
    value: int
    formatted: str
    period_key: str
    issued_by: str | None
    issued_at: datetime
    reservation_token: str | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Reserve / confirm / cancel
# ---------------------------------------------------------------------------

class ConfirmRequest(BaseModel):
    token: str


class CancelRequest(BaseModel):
    token: str


class ReserveResult(BaseModel):
    """Result of a reserve call.

    status:
      * "issued"   — single-phase numerator (TTL=0): number already consumed.
      * "reserved" — two-phase: a token + expires_at are returned; CONFIRM next.
      * "pending"  — another reservation is active; retry after retry_after_seconds.
    """

    status: Literal["issued", "reserved", "pending"]
    numerator_id: str
    key: str
    value: Optional[int] = None
    formatted: Optional[str] = None
    period_key: Optional[str] = None
    token: Optional[str] = None
    expires_at: Optional[datetime] = None
    issued_at: Optional[datetime] = None
    retry_after_seconds: Optional[int] = None


class ConfirmResult(BaseModel):
    status: Literal["issued"] = "issued"
    numerator_id: str
    key: str
    value: int
    formatted: str
    period_key: str
    issued_at: datetime


class PeekResult(BaseModel):
    numerator_id: str
    key: str
    value: int
    formatted: str
    period_key: str
