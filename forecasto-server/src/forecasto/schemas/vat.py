"""VAT calculation schemas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class VatCalculationRequest(BaseModel):
    """Request to calculate periodic VAT using a VAT registry."""

    vat_registry_id: str
    period_type: str  # "monthly" | "quarterly"
    end_month: str | None = None  # "YYYY-MM", defaults to current month
    use_summer_extension: bool = True  # Q2 quarterly: Aug 16 vs Sep 16


class VatPeriodResult(BaseModel):
    """Result for a single VAT period + area."""

    period: str  # "2026-03" or "2026-Q1"
    area: str  # "actual", "orders", "prospect", "budget"
    iva_debito: Decimal
    iva_credito: Decimal
    credit_carried: Decimal
    net: Decimal  # positive = debito, negative = credito
    date_cashflow: date
    review_date: date
    record_id: str | None = None


class VatCalculationResponse(BaseModel):
    """Response from VAT calculation."""

    periods: list[VatPeriodResult]
    total_debito: Decimal
    total_credito: Decimal
    total_net: Decimal
    records_created: int
    target_workspace_id: str | None = None
    dry_run: bool = False
