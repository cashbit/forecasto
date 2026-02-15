"""Workspace schemas."""

from __future__ import annotations


from datetime import datetime

from pydantic import BaseModel, Field, field_validator


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

def _current_year() -> int:
    return datetime.now().year

class WorkspaceCreate(BaseModel):
    """Workspace creation request."""

    name: str
    description: str | None = None
    fiscal_year: int = Field(default_factory=_current_year)
    email_whitelist: list[str] | None = None
    settings: dict | None = None

class WorkspaceUpdate(BaseModel):
    """Workspace update request."""

    name: str | None = None
    description: str | None = None
    fiscal_year: int | None = None
    is_archived: bool | None = None
    settings: dict | None = None

class WorkspaceResponse(BaseModel):
    """Workspace response."""

    id: str
    name: str
    description: str | None = None
    fiscal_year: int
    is_archived: bool
    settings: dict
    email_whitelist: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class WorkspaceWithRole(BaseModel):
    """Workspace with user's role and permissions."""

    id: str
    name: str
    description: str | None = None
    fiscal_year: int
    is_archived: bool
    settings: dict
    role: str
    area_permissions: dict

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
    """Invitation creation request."""

    invite_code: str
    role: str = "member"
    area_permissions: AreaPermissions | None = None
    granular_permissions: GranularAreaPermissions | None = None
    can_import: bool = True
    can_import_sdi: bool = True
    can_export: bool = True

    @field_validator('invite_code')
    @classmethod
    def validate_invite_code(cls, v: str) -> str:
        """Normalize and validate invite code format."""
        # Normalize: uppercase, remove dashes and spaces
        cleaned = v.upper().replace('-', '').replace(' ', '')
        if len(cleaned) != 9:
            raise ValueError('Codice deve essere di 9 caratteri')
        if not cleaned.isalnum():
            raise ValueError('Codice deve contenere solo lettere e numeri')
        return f"{cleaned[:3]}-{cleaned[3:6]}-{cleaned[6:9]}"

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
