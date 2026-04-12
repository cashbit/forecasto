"""User schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    """User registration request."""

    email: EmailStr
    password: str
    name: str
    registration_code: str

    @field_validator("registration_code")
    @classmethod
    def normalize_registration_code(cls, v: str) -> str:
        """Normalize code format: uppercase, add dashes if missing."""
        cleaned = v.upper().replace("-", "").replace(" ", "")
        if len(cleaned) != 12:
            raise ValueError("Il codice deve essere di 12 caratteri")
        if not cleaned.isalnum():
            raise ValueError("Il codice deve contenere solo lettere e numeri")
        return f"{cleaned[:4]}-{cleaned[4:8]}-{cleaned[8:12]}"

class UserUpdate(BaseModel):
    """User profile update request."""

    name: str | None = None
    notification_preferences: dict | None = None
    ui_preferences: dict | None = None
    agent_prompt: str | None = None


class PasswordChange(BaseModel):
    """Password change request."""

    current_password: str
    new_password: str

class UserResponse(BaseModel):
    """User profile response."""

    id: str
    email: str
    name: str
    invite_code: str
    email_verified: bool
    is_admin: bool = False
    is_partner: bool = False
    monthly_page_quota: int = 50
    created_at: datetime
    last_login_at: datetime | None = None
    notification_preferences: dict
    ui_preferences: dict = {}
    agent_prompt: str | None = None

    model_config = {"from_attributes": True}


class DeleteAccountRequest(BaseModel):
    """Account deletion request — requires password confirmation."""

    password: str


class WorkspaceSummary(BaseModel):
    """Summary of a workspace for deletion precheck."""

    id: str
    name: str
    member_count: int = 0
    record_count: int = 0


class DeleteAccountPrecheck(BaseModel):
    """Response for account deletion precheck."""

    can_delete: bool
    owned_workspaces_with_members: list[WorkspaceSummary] = []
    owned_workspaces_solo: list[WorkspaceSummary] = []
    bank_accounts_count: int = 0
    vat_registries_count: int = 0
    message: str = ""
