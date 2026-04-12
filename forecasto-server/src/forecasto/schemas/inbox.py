"""Inbox schemas — document queue from Forecasto Agent."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class RecordSuggestion(BaseModel):
    """A single record suggestion extracted by the LLM from a document."""

    area: str = "actual"
    type: str = ""
    account: str = ""
    reference: str = ""
    note: str | None = None
    date_offer: str = ""      # YYYY-MM-DD string (easier for LLM + JSON editing)
    date_document: str | None = None  # YYYY-MM-DD document/invoice date
    date_cashflow: str = ""   # YYYY-MM-DD string
    amount: Decimal = Decimal("0")
    vat: Decimal = Decimal("0")
    vat_deduction: Decimal = Decimal("100")
    vat_month: str | None = None
    total: Decimal = Decimal("0")
    stage: str = "0"
    transaction_id: str | None = None
    bank_account_id: str | None = None
    project_code: str | None = None
    withholding_rate: Decimal | None = None
    classification: dict[str, Any] | None = None
    # Populated by server-side similarity search (not from LLM)
    matched_record: dict[str, Any] | None = None  # best match auto-assigned
    similar_records: list[dict[str, Any]] = Field(default_factory=list)  # all candidates


class InboxItemCreate(BaseModel):
    """Payload sent by the agent when submitting a processed document."""

    source_path: str
    source_filename: str
    source_hash: str
    llm_provider: str
    llm_model: str
    agent_version: str | None = None
    extracted_data: list[RecordSuggestion]
    document_type: str | None = None
    reconciliation_matches: list = Field(default_factory=list)


class InboxItemUpdate(BaseModel):
    """User-editable fields (extracted_data can be modified before confirm)."""

    extracted_data: list[RecordSuggestion] | None = None
    reconciliation_matches: list[dict] | None = None


class InboxItemResponse(BaseModel):
    """Full response for an inbox item."""

    id: str
    workspace_id: str
    status: str
    source_path: str
    source_filename: str
    source_hash: str
    source_deleted: bool
    llm_provider: str
    llm_model: str
    agent_version: str | None
    extracted_data: list[RecordSuggestion]
    confirmed_record_ids: list[str]
    document_type: str | None
    reconciliation_matches: list
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    model_config = {"from_attributes": True}


class InboxCountResponse(BaseModel):
    """Count of pending inbox items."""

    pending: int
