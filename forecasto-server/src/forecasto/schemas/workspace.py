"""Workspace schemas."""

from __future__ import annotations


from datetime import datetime

from pydantic import BaseModel, EmailStr

class AreaPermissions(BaseModel):
    """Permissions for each area."""

    actual: str = "write"  # none, read, write
    orders: str = "write"
    prospect: str = "write"
    budget: str = "write"

class WorkspaceCreate(BaseModel):
    """Workspace creation request."""

    name: str
    fiscal_year: int
    email_whitelist: list[str] | None = None
    settings: dict | None = None

class WorkspaceResponse(BaseModel):
    """Workspace response."""

    id: str
    name: str
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
    fiscal_year: int
    is_archived: bool
    role: str
    area_permissions: dict

    model_config = {"from_attributes": True}

class MemberUser(BaseModel):
    """Member user info."""

    id: str
    email: str
    name: str

class MemberResponse(BaseModel):
    """Workspace member response."""

    id: str
    user: MemberUser
    role: str
    area_permissions: dict
    can_view_in_consolidated_cashflow: bool
    joined_at: datetime

    model_config = {"from_attributes": True}

class MemberUpdate(BaseModel):
    """Member update request."""

    role: str | None = None
    area_permissions: AreaPermissions | None = None
    can_view_in_consolidated_cashflow: bool | None = None

class InvitationCreate(BaseModel):
    """Invitation creation request."""

    email: EmailStr
    role: str = "member"
    area_permissions: AreaPermissions | None = None

class InvitationResponse(BaseModel):
    """Invitation response."""

    id: str
    email: str
    role: str
    area_permissions: dict
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None

    model_config = {"from_attributes": True}
