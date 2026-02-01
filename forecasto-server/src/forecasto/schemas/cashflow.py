"""Cashflow schemas."""

from __future__ import annotations


from datetime import date
from decimal import Decimal

from pydantic import BaseModel

class CashflowRequest(BaseModel):
    """Cashflow request parameters."""

    from_date: date
    to_date: date
    areas: list[str] | None = None
    stages: list[str] | None = None
    bank_account_id: str | None = None
    group_by: str = "day"  # day, week, month
    sign_filter: str | None = None  # in, out, all

class CashflowRecordSummary(BaseModel):
    """Summary of a record in cashflow."""

    id: str
    reference: str
    amount: Decimal
    area: str

class CashflowEntry(BaseModel):
    """Single cashflow entry."""

    date: date
    inflows: Decimal
    outflows: Decimal
    net: Decimal
    running_balance: Decimal
    records: list[CashflowRecordSummary] | None = None

class AccountBalance(BaseModel):
    """Balance for a single account."""

    name: str
    balance: Decimal
    credit_limit: Decimal

class InitialBalance(BaseModel):
    """Initial balance information."""

    date: date
    total: Decimal
    by_account: dict[str, AccountBalance]

class BalancePoint(BaseModel):
    """A point with date and balance."""

    date: date
    amount: Decimal

class CashflowSummary(BaseModel):
    """Summary of cashflow calculation."""

    total_inflows: Decimal
    total_outflows: Decimal
    net_cashflow: Decimal
    final_balance: Decimal
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
