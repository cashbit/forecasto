"""Customer (anagrafica cliente) schemas.

Customers are stored as documents in the per-workspace ``customers`` collection
(see :class:`CustomerService`). These schemas describe the API surface; the
stored ``data`` JSON mirrors :class:`CustomerData`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CustomerAddress(BaseModel):
    line_one: str | None = None
    line_two: str | None = None
    city: str | None = None
    postcode: str | None = None
    province: str | None = None  # sigla provincia (IT), e.g. "GE"
    country_code: str | None = None


class CustomerSdi(BaseModel):
    """Italian SDI delivery coordinates for the buyer."""

    codice_destinatario: str | None = None  # 7-char SDI code (or "0000000")
    pec: str | None = None  # certified email, alternative to the code


class CustomerContact(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None


class CustomerUpsert(BaseModel):
    """Create-or-update a customer. Keyed on VAT id (fallback: tax number)."""

    legal_name: str
    vat_id: str | None = None
    tax_number: str | None = None  # CodiceFiscale (IT)
    country_code: str = "IT"
    address: CustomerAddress = Field(default_factory=CustomerAddress)
    sdi: CustomerSdi = Field(default_factory=CustomerSdi)
    contact: CustomerContact = Field(default_factory=CustomerContact)
    default_payment_terms: str | None = None
    notes: str | None = None
    vies: dict[str, Any] | None = None  # optional provenance block from a VIES lookup
    source: str | None = None  # "manual" | "vies" | "sdi-import" | "order-extract"


class CustomerResponse(BaseModel):
    document_id: str
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# VIES (EU VAT validation) lookup
# ---------------------------------------------------------------------------

class ViesLookupRequest(BaseModel):
    country_code: str  # ISO 3166-1 alpha-2, e.g. "IT"
    vat_number: str  # without the country prefix


class ViesLookupResponse(BaseModel):
    valid: bool | None  # None = service unreachable / inconclusive
    country_code: str
    vat_number: str
    name: str | None = None
    address: CustomerAddress = Field(default_factory=CustomerAddress)
    raw_name: str | None = None
    raw_address: str | None = None
    error: str | None = None
