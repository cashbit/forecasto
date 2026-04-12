"""Prompt builder schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class GeneratePromptRequest(BaseModel):
    """Request to generate/update a prompt."""

    force_regenerate: bool = False


class PromptUsageInfo(BaseModel):
    """Token usage details for a generation."""

    input_tokens: int
    output_tokens: int
    total_cost_eur: float
    model: str


class GeneratePromptResponse(BaseModel):
    """Response from prompt generation."""

    success: bool = True
    prompt: str
    is_update: bool = False
    usage: PromptUsageInfo
    records_analyzed: int


class AgentPromptResponse(BaseModel):
    """Response with current prompt status."""

    prompt: str | None = None
    last_generated_at: datetime | None = None
    records_analyzed: int = 0
    auto_update: bool = False
    records_since_regen: int = 0


class AgentPromptUpdate(BaseModel):
    """Manual prompt update."""

    prompt: str | None = None
    auto_update: bool | None = None


class PatternAnalysisResponse(BaseModel):
    """Raw pattern analysis results (no LLM cost)."""

    total_records: int
    account_frequency: list[dict]
    reference_account_mapping: list[dict]
    reference_total_patterns: list[dict]
    type_area_mapping: list[dict]
    vat_deduction_patterns: list[dict]
    withholding_patterns: list[dict]
    project_account_mapping: list[dict]
    stage_patterns: list[dict]
    payment_terms: list[dict]


class PromptGenerationJobResponse(BaseModel):
    """Single generation job for history."""

    id: str
    scope: str
    status: str
    llm_model: str | None
    input_tokens: int
    output_tokens: int
    total_cost_eur: float
    records_analyzed: int
    billing_month: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageSummaryResponse(BaseModel):
    """Aggregated usage per month."""

    month: str
    total_input_tokens: int
    total_output_tokens: int
    total_cost_eur: float
    generation_count: int


class UsageSummaryListResponse(BaseModel):
    """List of monthly usage summaries."""

    months: list[UsageSummaryResponse]
