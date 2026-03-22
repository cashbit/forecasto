"""VAT Registry schemas — anagrafica partite IVA."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class VatRegistryCreate(BaseModel):
    """Create a new VAT registry entry."""

    name: str
    vat_number: str


class VatRegistryUpdate(BaseModel):
    """Update a VAT registry entry."""

    name: str | None = None
    vat_number: str | None = None


class VatRegistryResponse(BaseModel):
    """VAT registry response."""

    id: str
    owner_id: str
    name: str
    vat_number: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VatBalanceCreate(BaseModel):
    """Create a VAT balance entry."""

    month: str  # "YYYY-MM"
    amount: Decimal  # positive = credit, negative = debit
    note: str | None = None


class VatBalanceUpdate(BaseModel):
    """Update a VAT balance entry."""

    amount: Decimal | None = None
    note: str | None = None


class VatBalanceResponse(BaseModel):
    """VAT balance response."""

    id: str
    vat_registry_id: str
    month: str
    amount: Decimal
    note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
