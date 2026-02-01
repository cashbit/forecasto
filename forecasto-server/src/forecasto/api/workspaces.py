"""Workspace endpoints."""

from __future__ import annotations


from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.common import SuccessResponse
from forecasto.schemas.workspace import (
    InvitationCreate,
    InvitationResponse,
    MemberResponse,
    MemberUpdate,
    MemberUser,
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceWithRole,
)
from forecasto.services.workspace_service import WorkspaceService

router = APIRouter()

@router.get("", response_model=dict)
async def list_workspaces(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List workspaces accessible by current user."""

    service = WorkspaceService(db)
    results = await service.list_workspaces(current_user)

    workspaces = [
        WorkspaceWithRole(
            id=ws.id,
            name=ws.name,
            fiscal_year=ws.fiscal_year,
            is_archived=ws.is_archived,
            role=member.role,
            area_permissions=member.area_permissions,
        )
        for ws, member in results
    ]

    return {"success": True, "workspaces": workspaces}

@router.post("", response_model=dict, status_code=201)
async def create_workspace(
    data: WorkspaceCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new workspace."""
    service = WorkspaceService(db)
    workspace = await service.create_workspace(data, current_user)
    return {"success": True, "workspace": WorkspaceResponse.model_validate(workspace)}

@router.get("/{workspace_id}", response_model=dict)
async def get_workspace(
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
):
    """Get workspace details."""
    workspace, member = workspace_data
    return {
        "success": True,
        "workspace": WorkspaceResponse.model_validate(workspace),
        "role": member.role,
        "area_permissions": member.area_permissions,
    }

@router.get("/{workspace_id}/members", response_model=dict)
async def list_members(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List workspace members."""
    service = WorkspaceService(db)
    members = await service.get_members(workspace_id)

    # Eagerly load user data
    member_responses = []
    for m in members:
        await db.refresh(m, ["user"])
        member_responses.append(
            MemberResponse(
                id=m.id,
                user=MemberUser(id=m.user.id, email=m.user.email, name=m.user.name),
                role=m.role,
                area_permissions=m.area_permissions,
                can_view_in_consolidated_cashflow=m.can_view_in_consolidated_cashflow,
                joined_at=m.joined_at,
            )
        )

    return {"success": True, "members": member_responses}

@router.post("/{workspace_id}/invitations", response_model=dict, status_code=201)
async def create_invitation(
    workspace_id: str,
    data: InvitationCreate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create an invitation to join workspace."""
    workspace, member = workspace_data
    service = WorkspaceService(db)
    invitation = await service.create_invitation(workspace_id, data, current_user, member)
    return {"success": True, "invitation": InvitationResponse.model_validate(invitation)}

@router.patch("/{workspace_id}/members/{user_id}", response_model=dict)
async def update_member(
    workspace_id: str,
    user_id: str,
    data: MemberUpdate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update member role and permissions."""
    workspace, requesting_member = workspace_data
    service = WorkspaceService(db)
    member = await service.update_member(workspace_id, user_id, data, requesting_member)
    await db.refresh(member, ["user"])

    return {
        "success": True,
        "member": MemberResponse(
            id=member.id,
            user=MemberUser(id=member.user.id, email=member.user.email, name=member.user.name),
            role=member.role,
            area_permissions=member.area_permissions,
            can_view_in_consolidated_cashflow=member.can_view_in_consolidated_cashflow,
            joined_at=member.joined_at,
        ),
    }
