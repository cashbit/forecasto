"""Record schemas."""

from __future__ import annotations


from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

class RecordCreate(BaseModel):
    """Record creation request."""

    area: str  # budget, prospect, orders, actual
    type: str
    account: str
    reference: str
    note: str | None = None
    date_cashflow: date
    date_offer: date
    owner: str | None = None
    nextaction: str | None = None
    amount: Decimal
    vat: Decimal = Decimal("0")
    total: Decimal
    stage: str
    transaction_id: str | None = None
    bank_account_id: str | None = None
    project_code: str | None = None
    review_date: date | None = None

    @field_validator("area")
    @classmethod
    def validate_area(cls, v: str) -> str:
        valid_areas = ["budget", "prospect", "orders", "actual"]
        if v not in valid_areas:
            raise ValueError(f"Area must be one of: {valid_areas}")
        return v

class RecordUpdate(BaseModel):
    """Record update request."""

    type: str | None = None
    account: str | None = None
    reference: str | None = None
    note: str | None = None
    date_cashflow: date | None = None
    date_offer: date | None = None
    owner: str | None = None
    nextaction: str | None = None
    amount: Decimal | None = None
    vat: Decimal | None = None
    total: Decimal | None = None
    stage: str | None = None
    transaction_id: str | None = None
    bank_account_id: str | None = None
    project_code: str | None = None
    review_date: date | None = None

class TransferHistoryEntry(BaseModel):
    """Entry in transfer history."""

    from_area: str
    to_area: str
    transferred_at: datetime
    transferred_by: str
    note: str | None = None

class RecordResponse(BaseModel):
    """Record response."""

    id: str
    workspace_id: str
    area: str
    type: str
    account: str
    reference: str
    note: str | None = None
    date_cashflow: date
    date_offer: date
    owner: str | None = None
    nextaction: str | None = None
    amount: Decimal
    vat: Decimal
    total: Decimal
    stage: str
    transaction_id: str | None = None
    bank_account_id: str | None = None
    project_code: str | None = None
    review_date: date | None = None
    classification: dict
    transfer_history: list[TransferHistoryEntry]
    version: int
    is_draft: bool = False
    created_by: str | None = None
    updated_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class RecordFilter(BaseModel):
    """Record filter parameters."""

    area: str | None = None
    date_start: date | None = None
    date_end: date | None = None
    sign: str | None = None  # in, out, all
    text_filter: str | None = None
    text_filter_field: str | None = None  # account, reference, note, owner, transaction_id — None = all
    project_code: str | None = None
    bank_account_id: str | None = None
    include_deleted: bool = False

class TransferRequest(BaseModel):
    """Record transfer request."""

    to_area: str
    note: str | None = None

    @field_validator("to_area")
    @classmethod
    def validate_area(cls, v: str) -> str:
        valid_areas = ["budget", "prospect", "orders", "actual"]
        if v not in valid_areas:
            raise ValueError(f"Area must be one of: {valid_areas}")
        return v

class TransferResponse(BaseModel):
    """Record transfer response."""

    success: bool = True
    record: RecordResponse
    operation: dict

