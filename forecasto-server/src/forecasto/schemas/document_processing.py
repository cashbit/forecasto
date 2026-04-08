"""Schemas for document processing, usage tracking, and LLM pricing."""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, model_validator


class DocumentUploadResponse(BaseModel):
    """Returned after file upload -- processing starts in background."""
    job_id: str
    status: str
    source_filename: str
    queue_position: int


class ProcessingJobResponse(BaseModel):
    """Full job details including usage."""
    id: str
    workspace_id: str
    status: str
    source_filename: str
    source_hash: str
    file_size_bytes: int
    file_content_type: str
    upload_source: str
    llm_model: str
    pages_processed: int = 0
    inbox_item_id: str | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    usage: UsageRecordResponse | None = None

    model_config = {"from_attributes": True}


class UsageRecordResponse(BaseModel):
    """Single usage entry."""
    id: str
    workspace_id: str
    job_id: str
    llm_provider: str
    llm_model: str
    pages_processed: int = 0
    input_tokens: int
    output_tokens: int
    cache_creation_tokens: int
    cache_read_tokens: int
    total_tokens: int = 0
    created_at: datetime

    @model_validator(mode="after")
    def compute_total_tokens(self) -> "UsageRecordResponse":
        self.total_tokens = self.input_tokens + self.output_tokens
        return self

    model_config = {"from_attributes": True}


class UsageSummaryResponse(BaseModel):
    """Aggregated usage stats for a workspace."""
    total_documents: int
    total_pages: int
    total_input_tokens: int
    total_output_tokens: int
    by_model: list[ModelUsageSummary]
    # Monthly quota (user-level, cross-workspace)
    monthly_page_quota: int = 50
    pages_this_month: int = 0
    pages_remaining: int = 50


class ModelUsageSummary(BaseModel):
    """Per-model breakdown."""
    llm_model: str
    document_count: int
    pages: int
    input_tokens: int
    output_tokens: int


class LLMPricingResponse(BaseModel):
    """Pricing config entry."""
    id: str
    model_name: str
    display_name: str
    input_price_per_mtok: float
    output_price_per_mtok: float
    multiplier: float
    is_default: bool
    is_active: bool

    model_config = {"from_attributes": True}


class LLMPricingUpdate(BaseModel):
    """Admin-editable fields."""
    input_price_per_mtok: float | None = None
    output_price_per_mtok: float | None = None
    multiplier: float | None = None
    is_default: bool | None = None
    is_active: bool | None = None


class QueueStatusResponse(BaseModel):
    """Current processing queue status."""
    queued: int
    processing: int
    max_concurrent: int
    max_queue_size: int
