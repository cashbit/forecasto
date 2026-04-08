"""Admin schemas for registration codes and user management."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class CreateBatchRequest(BaseModel):
    """Request to generate a batch of registration codes."""

    name: str = Field(..., min_length=1, max_length=100)
    count: int = Field(default=1, ge=1, le=100)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)
    note: str | None = None
    partner_id: str | None = None


class UpdateBatchRequest(BaseModel):
    """Request to update a batch name."""

    name: str = Field(..., min_length=1, max_length=100)


class RegistrationCodeResponse(BaseModel):
    """Single registration code response."""

    id: str
    code: str
    created_at: datetime
    expires_at: datetime | None = None
    used_at: datetime | None = None
    used_by_id: str | None = None
    used_by_email: str | None = None
    used_by_name: str | None = None
    revoked_at: datetime | None = None
    recipient_name: str | None = None
    recipient_email: str | None = None
    invoiced: bool = False
    invoiced_at: datetime | None = None
    invoiced_to: str | None = None
    invoice_note: str | None = None
    partner_fee_recognized: bool = False
    partner_fee_recognized_at: datetime | None = None
    ac_synced_at: datetime | None = None

    model_config = {"from_attributes": True}


class UpdateCodeRecipientRequest(BaseModel):
    """Request to update recipient info on a registration code."""

    recipient_name: str | None = None
    recipient_email: str | None = None


class BatchResponse(BaseModel):
    """Registration code batch response."""

    id: str
    name: str
    created_at: datetime
    expires_at: datetime | None = None
    note: str | None = None
    partner_id: str | None = None
    partner_name: str | None = None
    total_codes: int = 0
    used_codes: int = 0
    available_codes: int = 0

    model_config = {"from_attributes": True}


class BatchWithCodesResponse(BaseModel):
    """Batch response including all codes."""

    id: str
    name: str
    created_at: datetime
    expires_at: datetime | None = None
    note: str | None = None
    partner_id: str | None = None
    partner_name: str | None = None
    codes: list[RegistrationCodeResponse]

    model_config = {"from_attributes": True}


class BatchListResponse(BaseModel):
    """List of batches response."""

    batches: list[BatchResponse]


class CodeListResponse(BaseModel):
    """List of codes response."""

    codes: list[RegistrationCodeResponse]
    total: int


class BillingProfileCreate(BaseModel):
    """Request to create a billing profile."""

    company_name: str = Field(..., min_length=1, max_length=255)
    vat_number: str = Field(..., min_length=1, max_length=20)
    legal_form: str | None = None
    billing_address: str | None = None
    sdi_code: str | None = Field(default=None, max_length=7)
    iban: str | None = Field(default=None, max_length=34)
    swift: str | None = Field(default=None, max_length=11)
    iban_holder: str | None = None
    setup_cost: float = 0
    monthly_cost_first_year: float = 0
    monthly_cost_after_first_year: float = 0
    monthly_page_quota: int = Field(default=0, ge=0)
    page_package_cost: float = 0
    max_users: int = Field(default=1, ge=1)


class BillingProfileUpdate(BaseModel):
    """Request to update a billing profile (all fields optional)."""

    company_name: str | None = Field(default=None, min_length=1, max_length=255)
    vat_number: str | None = Field(default=None, min_length=1, max_length=20)
    legal_form: str | None = None
    billing_address: str | None = None
    sdi_code: str | None = Field(default=None, max_length=7)
    iban: str | None = Field(default=None, max_length=34)
    swift: str | None = Field(default=None, max_length=11)
    iban_holder: str | None = None
    setup_cost: float | None = None
    monthly_cost_first_year: float | None = None
    monthly_cost_after_first_year: float | None = None
    monthly_page_quota: int | None = Field(default=None, ge=0)
    page_package_cost: float | None = None
    max_users: int | None = Field(default=None, ge=1)


class BillingProfileUserInfo(BaseModel):
    """Minimal user info for billing profile responses."""

    id: str
    email: str
    name: str
    is_billing_master: bool

    model_config = {"from_attributes": True}


class BillingProfileResponse(BaseModel):
    """Billing profile response."""

    id: str
    company_name: str
    legal_form: str | None = None
    vat_number: str
    billing_address: str | None = None
    sdi_code: str | None = None
    iban: str | None = None
    swift: str | None = None
    iban_holder: str | None = None
    setup_cost: float = 0
    monthly_cost_first_year: float = 0
    monthly_cost_after_first_year: float = 0
    monthly_page_quota: int = 0
    page_package_cost: float = 0
    max_users: int = 1
    users_count: int = 0
    master_user_id: str | None = None
    master_user_name: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BillingProfileDetailResponse(BillingProfileResponse):
    """Billing profile response with user list."""

    users: list[BillingProfileUserInfo] = []


class BillingProfileListResponse(BaseModel):
    """List of billing profiles."""

    profiles: list[BillingProfileResponse]
    total: int


class SetAdminRequest(BaseModel):
    """Request to set/unset admin role."""

    is_admin: bool


class SetBillingProfileRequest(BaseModel):
    """Request to associate a user with a billing profile."""

    billing_profile_id: str | None = None
    is_billing_master: bool = False


class SetMaxRecordsFreeRequest(BaseModel):
    """Request to set max records for free users."""

    max_records_free: int = Field(..., ge=0)


class AdminUserResponse(BaseModel):
    """User response for admin panel."""

    id: str
    email: str
    name: str
    is_admin: bool
    is_partner: bool
    partner_type: str | None = None
    is_blocked: bool
    blocked_at: datetime | None = None
    blocked_reason: str | None = None
    registration_code_id: str | None = None
    registration_code: str | None = None
    billing_profile_id: str | None = None
    billing_profile_company: str | None = None
    is_billing_master: bool = False
    max_records_free: int = 100
    monthly_page_quota: int = 50
    created_at: datetime
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class AdminUserListResponse(BaseModel):
    """List of users for admin panel."""

    users: list[AdminUserResponse]
    total: int


class BlockUserRequest(BaseModel):
    """Request to block a user."""

    reason: str | None = None


class UserFilter(BaseModel):
    """Filter for user list."""

    search: str | None = None
    status: Literal["all", "active", "blocked", "admin", "partner"] | None = "all"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=100)


class CodeFilter(BaseModel):
    """Filter for code list."""

    batch_id: str | None = None
    status: Literal["all", "available", "used", "revoked", "expired"] | None = "all"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=100)


class ValidateCodeRequest(BaseModel):
    """Request to validate a registration code."""

    code: str

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        """Normalize code format: uppercase, add dashes if missing."""
        cleaned = v.upper().replace("-", "").replace(" ", "")
        if len(cleaned) != 12:
            raise ValueError("Il codice deve essere di 12 caratteri")
        if not cleaned.isalnum():
            raise ValueError("Il codice deve contenere solo lettere e numeri")
        return f"{cleaned[:4]}-{cleaned[4:8]}-{cleaned[8:12]}"


class SetPartnerRequest(BaseModel):
    """Request to set/unset partner role."""

    is_partner: bool


class SetPartnerTypeRequest(BaseModel):
    """Request to set partner billing type."""

    partner_type: Literal["billing_to_client", "billing_to_partner"]


class InvoiceCodesRequest(BaseModel):
    """Request to mark codes as invoiced."""

    code_ids: list[str]
    invoiced_to: Literal["client", "partner"]
    invoice_note: str | None = None


class RecognizeFeeRequest(BaseModel):
    """Request to recognize partner fee for codes."""

    code_ids: list[str]


class ActivatedCodesReportFilter(BaseModel):
    """Filter for activated codes report."""

    partner_id: str | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    year: int | None = None
    invoiced: bool | None = None


class ActivatedCodeReportRow(BaseModel):
    """Single row in activated codes report."""

    code_id: str
    code: str
    used_at: datetime | None = None
    used_by_name: str | None = None
    used_by_email: str | None = None
    batch_name: str | None = None
    partner_id: str | None = None
    partner_name: str | None = None
    partner_type: str | None = None
    invoiced: bool = False
    invoiced_at: datetime | None = None
    invoiced_to: str | None = None
    invoice_note: str | None = None
    partner_fee_recognized: bool = False
    partner_fee_recognized_at: datetime | None = None


class PartnerBillingSummary(BaseModel):
    """Billing summary for a partner."""

    partner_id: str
    partner_name: str
    partner_type: str | None = None
    total_activated: int = 0
    invoiced_count: int = 0
    not_invoiced_count: int = 0
    invoiced_to_client: int = 0
    invoiced_to_partner: int = 0
    fee_recognized_count: int = 0
    fee_pending_count: int = 0


class AssignPartnerRequest(BaseModel):
    """Request to assign a batch to a partner."""

    partner_id: str


class ValidateCodeResponse(BaseModel):
    """Response for code validation."""

    valid: bool
    code: str | None = None
    expires_at: datetime | None = None
    error: str | None = None
