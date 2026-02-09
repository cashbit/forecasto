"""Cashflow schemas."""

from __future__ import annotations


from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, model_serializer


class DecimalAsFloat(BaseModel):
    """Base model that serializes Decimal as float for JSON."""

    @model_serializer(mode='wrap')
    def serialize_model(self, handler: Any) -> dict[str, Any]:
        data = handler(self)
        # Convert any Decimal values to float recursively
        return self._convert_decimals(data)

    @staticmethod
    def _convert_decimals(obj: Any) -> Any:
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: DecimalAsFloat._convert_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [DecimalAsFloat._convert_decimals(v) for v in obj]
        return obj


class CashflowRequest(BaseModel):
    """Cashflow request parameters."""

    from_date: date
    to_date: date
    areas: list[str] | None = None
    stages: list[str] | None = None
    bank_account_id: str | None = None
    group_by: str = "day"  # day, week, month
    sign_filter: str | None = None  # in, out, all

class CashflowRecordSummary(DecimalAsFloat):
    """Summary of a record in cashflow."""

    id: str
    reference: str
    amount: Decimal
    area: str

class AccountCashflowEntry(DecimalAsFloat):
    """Cashflow data for a single bank account within a period."""

    inflows: Decimal
    outflows: Decimal
    running_balance: Decimal

class CashflowEntry(DecimalAsFloat):
    """Single cashflow entry."""

    date: date
    inflows: Decimal
    outflows: Decimal
    net: Decimal
    running_balance: Decimal
    records: list[CashflowRecordSummary] | None = None
    by_account: dict[str, AccountCashflowEntry] | None = None

class AccountBalance(DecimalAsFloat):
    """Balance for a single account."""

    name: str
    balance: Decimal
    credit_limit: Decimal

class InitialBalance(DecimalAsFloat):
    """Initial balance information."""

    date: date
    total: Decimal
    by_account: dict[str, AccountBalance]

class BalancePoint(DecimalAsFloat):
    """A point with date and balance."""

    date: date
    amount: Decimal

class CashflowSummary(DecimalAsFloat):
    """Summary of cashflow calculation."""

    total_inflows: Decimal
    total_outflows: Decimal
    net_cashflow: Decimal
    final_balance: Decimal
    min_balance: BalancePoint
    max_balance: BalancePoint
    credit_limit_breaches: list[BalancePoint]

class CashflowResponse(DecimalAsFloat):
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
