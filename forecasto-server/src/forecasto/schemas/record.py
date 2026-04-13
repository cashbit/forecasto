"""Record schemas."""

from __future__ import annotations


from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, computed_field, field_validator

class RecordCreate(BaseModel):
    """Record creation request."""

    area: str  # budget, prospect, orders, actual
    type: str
    account: str
    reference: str
    note: str | None = None
    date_cashflow: date
    date_offer: date
    date_document: date | None = None
    owner: str | None = None
    nextaction: str | None = None
    amount: Decimal
    vat: Decimal = Decimal("0")
    vat_deduction: Decimal = Decimal("100")
    vat_month: str | None = None
    total: Decimal
    stage: str
    transaction_id: str | None = None
    bank_account_id: str | None = None
    project_code: str | None = None
    review_date: date | None = None
    withholding_rate: Decimal | None = None
    classification: dict | None = None

    @field_validator("area")
    @classmethod
    def validate_area(cls, v: str) -> str:
        valid_areas = ["budget", "prospect", "orders", "actual"]
        if v not in valid_areas:
            raise ValueError(f"Area must be one of: {valid_areas}")
        return v

    @field_validator("date_document", "review_date", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v

class RecordUpdate(BaseModel):
    """Record update request."""

    type: str | None = None
    account: str | None = None
    reference: str | None = None
    note: str | None = None
    date_cashflow: date | None = None
    date_offer: date | None = None
    date_document: date | None = None
    owner: str | None = None
    nextaction: str | None = None
    amount: Decimal | None = None
    vat: Decimal | None = None
    vat_deduction: Decimal | None = None
    vat_month: str | None = None
    total: Decimal | None = None
    stage: str | None = None
    transaction_id: str | None = None
    bank_account_id: str | None = None
    project_code: str | None = None
    review_date: date | None = None
    withholding_rate: Decimal | None = None
    classification: dict | None = None

    @field_validator("date_document", "review_date", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v

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
    date_document: date | None = None
    owner: str | None = None
    nextaction: str | None = None
    amount: Decimal
    vat: Decimal
    vat_deduction: Decimal
    vat_month: str | None = None
    total: Decimal
    stage: str
    transaction_id: str | None = None
    bank_account_id: str | None = None
    bank_account_name: str | None = None
    project_code: str | None = None
    review_date: date | None = None
    withholding_rate: Decimal | None = None
    classification: dict
    seq_num: int | None = None
    transfer_history: list[TransferHistoryEntry]
    version: int
    is_draft: bool = False
    created_by: str | None = None
    updated_by: str | None = None
    deleted_at: datetime | None = None
    deleted_by: str | None = None
    created_at: datetime
    updated_at: datetime
    creator_email: str | None = None
    updater_email: str | None = None
    deleter_email: str | None = None

    @computed_field
    @property
    def withholding_amount(self) -> Decimal | None:
        """Calculate withholding amount: |amount| * rate / 100."""
        if self.withholding_rate is None or self.withholding_rate == 0:
            return None
        return (abs(self.amount) * self.withholding_rate / Decimal("100")).quantize(Decimal("0.01"))

    model_config = {"from_attributes": True}

class RecordFilter(BaseModel):
    """Record filter parameters."""

    area: str | None = None
    date_start: date | None = None
    date_end: date | None = None
    date_field: str = "date_cashflow"  # date_cashflow, date_offer, date_document
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

