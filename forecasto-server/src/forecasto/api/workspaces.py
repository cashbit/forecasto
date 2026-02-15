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
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
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
            description=ws.description,
            fiscal_year=ws.fiscal_year,
            is_archived=ws.is_archived,
            settings=ws.settings or {},
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
    return {"success": True, "workspace": WorkspaceWithRole(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        fiscal_year=workspace.fiscal_year,
        is_archived=workspace.is_archived,
        settings=workspace.settings or {},
        role="owner",
        area_permissions={"actual": "write", "orders": "write", "prospect": "write", "budget": "write"},
    )}

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

@router.patch("/{workspace_id}", response_model=dict)
async def update_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update workspace details."""
    workspace, member = workspace_data
    service = WorkspaceService(db)
    updated = await service.update_workspace(workspace, data, member)
    await db.commit()
    await db.refresh(updated)
    return {
        "success": True,
        "workspace": WorkspaceResponse.model_validate(updated),
        "role": member.role,
        "area_permissions": member.area_permissions,
    }

@router.delete("/{workspace_id}", response_model=dict)
async def delete_workspace(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a workspace. Only owners can delete workspaces."""
    workspace, member = workspace_data
    service = WorkspaceService(db)
    await service.delete_workspace(workspace_id, member)
    await db.commit()
    return {"success": True, "message": "Workspace deleted"}


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

    # User relationship is eagerly loaded by service, use Pydantic auto-mapping
    member_responses = [MemberResponse.model_validate(m) for m in members]

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


@router.get("/{workspace_id}/invitations", response_model=dict)
async def list_workspace_invitations(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List pending invitations for a workspace."""
    workspace, member = workspace_data
    service = WorkspaceService(db)
    invitations = await service.get_workspace_invitations_with_user(workspace_id)
    return {
        "success": True,
        "invitations": invitations,
    }


@router.patch("/{workspace_id}/invitations/{invitation_id}", response_model=dict)
async def update_invitation(
    workspace_id: str,
    invitation_id: str,
    data: MemberUpdate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a pending invitation's role and permissions."""
    workspace, member = workspace_data
    service = WorkspaceService(db)
    invitation = await service.update_invitation(workspace_id, invitation_id, data, member)
    return {"success": True, "invitation": InvitationResponse.model_validate(invitation)}


@router.delete("/{workspace_id}/invitations/{invitation_id}", response_model=dict)
async def cancel_invitation(
    workspace_id: str,
    invitation_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Cancel a pending invitation."""
    workspace, member = workspace_data
    service = WorkspaceService(db)
    await service.cancel_invitation(workspace_id, invitation_id, member)
    return {"success": True, "message": "Invito annullato"}


@router.get("/invitations/pending", response_model=dict)
async def list_pending_invitations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List pending invitations for the current user."""
    service = WorkspaceService(db)
    invitations = await service.get_pending_invitations_for_user(current_user)
    return {
        "success": True,
        "invitations": [
            {
                "id": inv.id,
                "workspace_id": inv.workspace_id,
                "workspace_name": inv.workspace.name if inv.workspace else None,
                "role": inv.role,
                "area_permissions": inv.area_permissions,
                "granular_permissions": inv.granular_permissions,
                "created_at": inv.created_at,
                "expires_at": inv.expires_at,
            }
            for inv in invitations
        ],
    }


@router.post("/invitations/{invitation_id}/accept", response_model=dict)
async def accept_invitation(
    invitation_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Accept a pending invitation."""
    service = WorkspaceService(db)
    member = await service.accept_invitation(invitation_id, current_user)
    await db.refresh(member, ["user"])
    return {
        "success": True,
        "message": "Invitation accepted",
        "member": MemberResponse.model_validate(member),
    }

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
        "member": MemberResponse.model_validate(member),
    }
