"""Workspace service."""

from __future__ import annotations


import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ForbiddenException, NotFoundException, ValidationException
from forecasto.models.user import User
from forecasto.models.workspace import Invitation, Workspace, WorkspaceMember
from forecasto.schemas.workspace import InvitationCreate, MemberUpdate, WorkspaceCreate
from forecasto.utils.security import hash_password

class WorkspaceService:
    """Service for workspace operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_workspaces(self, user: User) -> list[tuple[Workspace, WorkspaceMember]]:
        """List workspaces accessible by user."""
        result = await self.db.execute(
            select(Workspace, WorkspaceMember)
            .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .where(WorkspaceMember.user_id == user.id)
            .order_by(Workspace.name)
        )
        return list(result.all())

    async def create_workspace(self, data: WorkspaceCreate, owner: User) -> Workspace:
        """Create a new workspace."""
        # Check unique name + fiscal_year
        result = await self.db.execute(
            select(Workspace).where(
                Workspace.name == data.name,
                Workspace.fiscal_year == data.fiscal_year,
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException(
                f"Workspace '{data.name}' for fiscal year {data.fiscal_year} already exists"
            )

        workspace = Workspace(
            name=data.name,
            description=data.description,
            fiscal_year=data.fiscal_year,
            owner_id=owner.id,
            email_whitelist=data.email_whitelist or [],
            settings=data.settings or {},
        )
        self.db.add(workspace)
        await self.db.flush()

        # Add owner as member
        member = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=owner.id,
            role="owner",
            area_permissions={
                "actual": "write",
                "orders": "write",
                "prospect": "write",
                "budget": "write",
            },
        )
        self.db.add(member)

        return workspace

    async def get_workspace(self, workspace_id: str) -> Workspace:
        """Get workspace by ID."""
        result = await self.db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = result.scalar_one_or_none()
        if not workspace:
            raise NotFoundException(f"Workspace {workspace_id} not found")
        return workspace

    async def get_members(self, workspace_id: str) -> list[WorkspaceMember]:
        """Get all members of a workspace."""
        result = await self.db.execute(
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace_id)
            .order_by(WorkspaceMember.joined_at)
        )
        return list(result.scalars().all())

    async def update_member(
        self,
        workspace_id: str,
        user_id: str,
        data: MemberUpdate,
        requesting_member: WorkspaceMember,
    ) -> WorkspaceMember:
        """Update member role and permissions."""
        # Check requester has admin/owner role
        if requesting_member.role not in ("owner", "admin"):
            raise ForbiddenException("Only owners and admins can update members")

        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            raise NotFoundException(f"Member {user_id} not found in workspace")

        # Cannot modify owner
        if member.role == "owner" and requesting_member.role != "owner":
            raise ForbiddenException("Only owner can modify owner role")

        if data.role is not None:
            if data.role == "owner":
                raise ForbiddenException("Cannot assign owner role")
            member.role = data.role

        if data.area_permissions is not None:
            member.area_permissions = data.area_permissions.model_dump()

        if data.can_view_in_consolidated_cashflow is not None:
            member.can_view_in_consolidated_cashflow = data.can_view_in_consolidated_cashflow

        return member

    async def delete_workspace(
        self,
        workspace_id: str,
        requesting_member: WorkspaceMember,
    ) -> None:
        """Delete a workspace. Only owners can delete workspaces."""
        if requesting_member.role != "owner":
            raise ForbiddenException("Only owners can delete workspaces")

        workspace = await self.get_workspace(workspace_id)

        # Delete the workspace - all related objects (members, records, sessions, etc.)
        # will be automatically deleted via ORM cascade="all, delete-orphan"
        await self.db.delete(workspace)

    async def create_invitation(
        self,
        workspace_id: str,
        data: InvitationCreate,
        inviter: User,
        requesting_member: WorkspaceMember,
    ) -> Invitation:
        """Create an invitation to join workspace."""
        if requesting_member.role not in ("owner", "admin"):
            raise ForbiddenException("Only owners and admins can invite members")

        # Check if already a member
        result = await self.db.execute(
            select(WorkspaceMember)
            .join(User, WorkspaceMember.user_id == User.id)
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                User.email == data.email,
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException("User is already a member of this workspace")

        # Check for existing pending invitation
        result = await self.db.execute(
            select(Invitation).where(
                Invitation.workspace_id == workspace_id,
                Invitation.email == data.email,
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.utcnow(),
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException("An invitation is already pending for this email")

        token = secrets.token_urlsafe(32)
        invitation = Invitation(
            workspace_id=workspace_id,
            invited_by=inviter.id,
            email=data.email,
            role=data.role,
            area_permissions=data.area_permissions.model_dump() if data.area_permissions else {},
            token_hash=hash_password(token),
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        self.db.add(invitation)
        await self.db.flush()

        return invitation
