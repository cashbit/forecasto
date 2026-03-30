"""Cashflow schemas."""

from __future__ import annotations


from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, PlainSerializer


# Pydantic v2: Decimal fields serialized as float in JSON responses.
# The old DecimalAsFloat model_serializer approach was broken because
# Pydantic v2's default JSON handler converts Decimal → str before the
# custom serializer runs, so isinstance(obj, Decimal) never matched.
DecimalFloat = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float)]


class CashflowRequest(BaseModel):
    """Cashflow request parameters."""

    from_date: date
    to_date: date
    areas: list[str] | None = None
    stages: list[str] | None = None
    area_stage: list[str] | None = None  # format: "area:stage", e.g. "actual:0", "orders:1"
    bank_account_id: str | None = None
    group_by: str = "day"  # day, week, month
    sign_filter: str | None = None  # in, out, all

class CashflowRecordSummary(BaseModel):
    """Summary of a record in cashflow."""

    id: str
    reference: str
    amount: DecimalFloat
    area: str

class AccountCashflowEntry(BaseModel):
    """Cashflow data for a single bank account within a period."""

    inflows: DecimalFloat
    outflows: DecimalFloat
    running_balance: DecimalFloat

class CashflowEntry(BaseModel):
    """Single cashflow entry."""

    date: date
    inflows: DecimalFloat
    outflows: DecimalFloat
    net: DecimalFloat
    running_balance: DecimalFloat
    balance_snapshot: DecimalFloat | None = None  # set when a BankAccountBalance reset occurred on this date
    records: list[CashflowRecordSummary] | None = None
    by_account: dict[str, AccountCashflowEntry] | None = None

class AccountBalance(BaseModel):
    """Balance for a single account."""

    name: str
    balance: DecimalFloat
    credit_limit: DecimalFloat

class InitialBalance(BaseModel):
    """Initial balance information."""

    date: date
    total: DecimalFloat
    by_account: dict[str, AccountBalance]

class BalancePoint(BaseModel):
    """A point with date and balance."""

    date: date
    amount: DecimalFloat

class CashflowSummary(BaseModel):
    """Summary of cashflow calculation."""

    total_inflows: DecimalFloat
    total_outflows: DecimalFloat
    net_cashflow: DecimalFloat
    final_balance: DecimalFloat
    min_balance: BalancePoint
    max_balance: BalancePoint
    credit_limit_breaches: list[BalancePoint]

class CashflowResponse(BaseModel):
    """Cashflow response."""

    success: bool = True
    parameters: CashflowRequest
    initial_balance: InitialBalance
    cashflow: list[CashflowEntry]
    summary: CashflowSummary

class ConsolidatedCashflowRequest(BaseModel):
    """Consolidated cashflow request for multiple workspaces."""

    workspace_ids: list[str]
    from_date: date
    to_date: date
    group_by: str = "day"


# ── VAT Simulation schemas ─────────────────────────────────────────

class CashflowVatEntry(BaseModel):
    """Single VAT payment entry in cashflow simulation."""

    date: date
    period: str  # "2026-03" or "2026-Q1"
    area: str
    iva_debito: DecimalFloat
    iva_credito: DecimalFloat
    credit_carried: DecimalFloat
    net: DecimalFloat  # positive = da versare (uscita)


class CashflowVatSeries(BaseModel):
    """VAT simulation series for one P.IVA."""

    vat_registry_id: str
    vat_number: str
    name: str
    bank_account_id: str | None = None
    entries: list[CashflowVatEntry]
    total_debito: DecimalFloat
    total_credito: DecimalFloat
    total_net: DecimalFloat


class CashflowVatResponse(BaseModel):
    """Response with VAT simulation series."""

    series: list[CashflowVatSeries]


# ── Withholding Tax (Ritenuta d'Acconto) Simulation schemas ──────

class CashflowWithholdingEntry(BaseModel):
    """Single withholding payment entry."""

    date: date
    period: str  # "YYYY-MM"
    area: str
    amount: DecimalFloat  # positive = da versare (uscita)


class CashflowWithholdingResponse(BaseModel):
    """Response with withholding simulation entries."""

    entries: list[CashflowWithholdingEntry]
    total: DecimalFloat
