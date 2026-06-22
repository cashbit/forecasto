"""Invoice (fattura attiva) schemas.

Invoices are stored as documents in the per-workspace ``invoices`` collection.
Monetary values are stored as decimal *strings* in the document JSON to preserve
cent precision (JSON has no Decimal); these schemas accept ``Decimal`` on input
and the service stringifies on store.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class InvoiceLineIn(BaseModel):
    id: str | None = None
    code: str | None = None  # article/service code (FatturaPA CodiceArticolo)
    name: str | None = None
    description: str | None = None
    quantity: Decimal = Decimal("1")
    unit_code: str = "C62"
    net_unit_price: Decimal
    discount_percent: Decimal | None = None  # line discount % (ScontoMaggiorazione)
    line_net_amount: Decimal | None = None  # computed from qty×price×(1−disc) if omitted
    vat_rate: Decimal = Decimal("22")
    vat_category: str = "S"  # EN16931 category (S=standard, N=non-taxable, ...)
    natura: str | None = None  # FatturaPA Natura for non-taxable lines (e.g. "N3.5")


class ScadenzaIn(BaseModel):
    id: str | None = None
    due_date: date
    amount: Decimal | None = None  # auto-distributed from the grand total if omitted
    modalita: str = "MP05"  # FatturaPA ModalitaPagamento (MP05 = bank transfer)


class PaymentsIn(BaseModel):
    means_code: str = "30"  # EN16931 payment means (30 = credit transfer)
    esigibilita_iva: str = "I"  # I=immediate, D=deferred, S=split payment
    terms: str | None = None  # free-text terms, e.g. "30/60/90 df fm" (parsed to scadenze)
    scadenze: list[ScadenzaIn] = Field(default_factory=list)


class PaymentTermsParseRequest(BaseModel):
    """Preview the due dates a payment-terms string yields for a given date."""

    text: str
    issue_date: date


class SdiSubmissionRequest(BaseModel):
    """Record a manual SDI submission, optionally with its outcome."""

    outcome: str | None = None  # None | "accepted" | "rejected"


class InvoiceDraftCreate(BaseModel):
    customer_document_id: str | None = None
    type_code: str = "380"  # 380 invoice, 381 credit note
    currency: str = "EUR"
    issue_date: date | None = None
    causale: str | None = None
    lines: list[InvoiceLineIn] = Field(default_factory=list)
    payments: PaymentsIn = Field(default_factory=PaymentsIn)
    fattura_pa_ext: dict[str, Any] | None = None
    extended: dict[str, Any] = Field(default_factory=dict)
    source_order_record_ids: list[str] = Field(default_factory=list)
    intent_letter_id: str | None = None


class InvoiceUpdate(BaseModel):
    customer_document_id: str | None = None
    type_code: str | None = None
    currency: str | None = None
    issue_date: date | None = None
    causale: str | None = None
    lines: list[InvoiceLineIn] | None = None
    payments: PaymentsIn | None = None
    fattura_pa_ext: dict[str, Any] | None = None
    extended: dict[str, Any] | None = None
    intent_letter_id: str | None = None


class InvoiceResponse(BaseModel):
    document_id: str
    status: str
    number: str | None
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime
