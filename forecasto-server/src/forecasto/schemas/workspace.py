"""Workspace schemas."""

from __future__ import annotations


from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator
from forecasto.schemas.bank_account import BankAccountResponse


class GranularPermission(BaseModel):
    """Granular permission for a specific action."""

    can_read_others: bool = True
    can_create: bool = True
    can_edit_others: bool = True
    can_delete_others: bool = True


class SignPermissions(BaseModel):
    """Permissions for inflow and outflow."""

    in_: GranularPermission = Field(default_factory=GranularPermission, alias="in")
    out: GranularPermission = Field(default_factory=GranularPermission)

    model_config = {"populate_by_name": True}


class GranularAreaPermissions(BaseModel):
    """Granular permissions for all areas."""

    budget: SignPermissions = Field(default_factory=SignPermissions)
    prospect: SignPermissions = Field(default_factory=SignPermissions)
    orders: SignPermissions = Field(default_factory=SignPermissions)
    actual: SignPermissions = Field(default_factory=SignPermissions)


class AreaPermissions(BaseModel):
    """Permissions for each area (legacy)."""

    actual: str = "write"  # none, read, write
    orders: str = "write"
    prospect: str = "write"
    budget: str = "write"

class WorkspaceCreate(BaseModel):
    """Workspace creation request."""

    name: str
    description: str | None = None
    email_whitelist: list[str] | None = None
    settings: dict | None = None

class WorkspaceUpdate(BaseModel):
    """Workspace update request."""

    name: str | None = None
    description: str | None = None
    is_archived: bool | None = None
    settings: dict | None = None
    vat_registry_id: str | None = None

class WorkspaceResponse(BaseModel):
    """Workspace response."""

    id: str
    name: str
    description: str | None = None
    is_archived: bool
    settings: dict
    email_whitelist: list[str]
    vat_registry_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class WorkspaceWithRole(BaseModel):
    """Workspace with user's role and permissions."""

    id: str
    name: str
    description: str | None = None
    is_archived: bool
    settings: dict
    role: str
    area_permissions: dict
    vat_registry_id: str | None = None
    bank_account_id: str | None = None
    bank_accounts: list[BankAccountResponse] = []
    can_import: bool = True
    can_import_sdi: bool = True
    can_export: bool = True

    model_config = {"from_attributes": True}

class MemberUser(BaseModel):
    """Member user info."""

    id: str
    email: str
    name: str

    model_config = {"from_attributes": True}

class MemberResponse(BaseModel):
    """Workspace member response."""

    id: str
    user: MemberUser
    role: str
    area_permissions: dict
    granular_permissions: dict | None = None
    can_view_in_consolidated_cashflow: bool
    can_import: bool
    can_import_sdi: bool
    can_export: bool
    joined_at: datetime

    model_config = {"from_attributes": True}

class MemberUpdate(BaseModel):
    """Member update request."""

    role: str | None = None
    area_permissions: AreaPermissions | None = None
    granular_permissions: GranularAreaPermissions | None = None
    can_view_in_consolidated_cashflow: bool | None = None
    can_import: bool | None = None
    can_import_sdi: bool | None = None
    can_export: bool | None = None

class InvitationCreate(BaseModel):
    """Invitation creation request. Provide either invite_code or user_id."""

    invite_code: str | None = None
    user_id: str | None = None
    role: str = "member"
    area_permissions: AreaPermissions | None = None
    granular_permissions: GranularAreaPermissions | None = None
    can_import: bool = True
    can_import_sdi: bool = True
    can_export: bool = True

    @field_validator('invite_code')
    @classmethod
    def validate_invite_code(cls, v: str | None) -> str | None:
        """Normalize and validate invite code format."""
        if v is None:
            return v
        # Normalize: uppercase, remove dashes and spaces
        cleaned = v.upper().replace('-', '').replace(' ', '')
        if len(cleaned) != 9:
            raise ValueError('Codice deve essere di 9 caratteri')
        if not cleaned.isalnum():
            raise ValueError('Codice deve contenere solo lettere e numeri')
        return f"{cleaned[:3]}-{cleaned[3:6]}-{cleaned[6:9]}"

    @model_validator(mode='after')
    def validate_invite_method(self) -> 'InvitationCreate':
        """Ensure at least one invite method is provided."""
        if not self.invite_code and not self.user_id:
            raise ValueError('Devi specificare invite_code o user_id')
        return self

class InvitationResponse(BaseModel):
    """Invitation response."""

    id: str
    invite_code: str
    role: str
    area_permissions: dict
    granular_permissions: dict | None = None
    can_import: bool
    can_import_sdi: bool
    can_export: bool
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None

    model_config = {"from_attributes": True}
