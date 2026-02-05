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

        if data.granular_permissions is not None:
            member.granular_permissions = data.granular_permissions.model_dump(by_alias=True)

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

        # Look up user by invite_code
        result = await self.db.execute(
            select(User).where(User.invite_code == data.invite_code)
        )
        target_user = result.scalar_one_or_none()
        if not target_user:
            raise NotFoundException(f"Nessun utente trovato con codice {data.invite_code}")

        # Check if already a member (via user_id)
        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == target_user.id,
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException("Utente è già membro di questo workspace")

        # Check for existing pending invitation (via invite_code)
        result = await self.db.execute(
            select(Invitation).where(
                Invitation.workspace_id == workspace_id,
                Invitation.invite_code == data.invite_code,
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.utcnow(),
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException("Un invito è già pendente per questo utente")

        token = secrets.token_urlsafe(32)
        invitation = Invitation(
            workspace_id=workspace_id,
            invited_by=inviter.id,
            invite_code=data.invite_code,
            role=data.role,
            area_permissions=data.area_permissions.model_dump() if data.area_permissions else {},
            granular_permissions=data.granular_permissions.model_dump(by_alias=True) if data.granular_permissions else {},
            token_hash=hash_password(token),
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        self.db.add(invitation)
        await self.db.flush()

        return invitation

    async def get_pending_invitations_for_user(self, user: User) -> list[Invitation]:
        """Get all pending invitations for a user by their invite_code."""
        from sqlalchemy.orm import selectinload

        result = await self.db.execute(
            select(Invitation)
            .options(selectinload(Invitation.workspace))
            .where(
                Invitation.invite_code == user.invite_code,
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.utcnow(),
            )
            .order_by(Invitation.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_workspace_invitations(self, workspace_id: str) -> list[Invitation]:
        """Get all pending invitations for a workspace."""
        result = await self.db.execute(
            select(Invitation)
            .where(
                Invitation.workspace_id == workspace_id,
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.utcnow(),
            )
            .order_by(Invitation.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_workspace_invitations_with_user(self, workspace_id: str) -> list[dict]:
        """Get all pending invitations for a workspace with user info."""
        result = await self.db.execute(
            select(Invitation, User)
            .join(User, Invitation.invite_code == User.invite_code)
            .where(
                Invitation.workspace_id == workspace_id,
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.utcnow(),
            )
            .order_by(Invitation.created_at.desc())
        )
        invitations = []
        for inv, user in result.all():
            invitations.append({
                "id": inv.id,
                "invite_code": inv.invite_code,
                "user_name": user.name,
                "role": inv.role,
                "area_permissions": inv.area_permissions,
                "granular_permissions": inv.granular_permissions,
                "created_at": inv.created_at,
                "expires_at": inv.expires_at,
            })
        return invitations

    async def update_invitation(
        self,
        workspace_id: str,
        invitation_id: str,
        data: MemberUpdate,
        requesting_member: WorkspaceMember,
    ) -> Invitation:
        """Update a pending invitation's role and permissions."""
        if requesting_member.role not in ("owner", "admin"):
            raise ForbiddenException("Solo owner e admin possono modificare gli inviti")

        result = await self.db.execute(
            select(Invitation).where(
                Invitation.id == invitation_id,
                Invitation.workspace_id == workspace_id,
                Invitation.accepted_at.is_(None),
            )
        )
        invitation = result.scalar_one_or_none()
        if not invitation:
            raise NotFoundException("Invito non trovato")

        if data.role is not None:
            if data.role == "owner":
                raise ForbiddenException("Non è possibile assegnare il ruolo owner")
            invitation.role = data.role

        if data.area_permissions is not None:
            invitation.area_permissions = data.area_permissions.model_dump()

        if data.granular_permissions is not None:
            invitation.granular_permissions = data.granular_permissions.model_dump(by_alias=True)

        return invitation

    async def cancel_invitation(
        self, workspace_id: str, invitation_id: str, requesting_member: WorkspaceMember
    ) -> None:
        """Cancel a pending invitation."""
        if requesting_member.role not in ("owner", "admin"):
            raise ForbiddenException("Solo owner e admin possono annullare gli inviti")

        result = await self.db.execute(
            select(Invitation).where(
                Invitation.id == invitation_id,
                Invitation.workspace_id == workspace_id,
            )
        )
        invitation = result.scalar_one_or_none()
        if not invitation:
            raise NotFoundException("Invito non trovato")

        await self.db.delete(invitation)

    async def accept_invitation(self, invitation_id: str, user: User) -> WorkspaceMember:
        """Accept a pending invitation and become a workspace member."""
        result = await self.db.execute(
            select(Invitation).where(Invitation.id == invitation_id)
        )
        invitation = result.scalar_one_or_none()

        if not invitation:
            raise NotFoundException(f"Invitation {invitation_id} not found")

        if invitation.invite_code != user.invite_code:
            raise ForbiddenException("Questo invito è per un altro utente")

        if invitation.accepted_at is not None:
            raise ValidationException("This invitation has already been accepted")

        if invitation.expires_at < datetime.utcnow():
            raise ValidationException("This invitation has expired")

        # Check if already a member
        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == invitation.workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException("You are already a member of this workspace")

        # Create membership
        member = WorkspaceMember(
            workspace_id=invitation.workspace_id,
            user_id=user.id,
            role=invitation.role,
            area_permissions=invitation.area_permissions or {
                "actual": "write",
                "orders": "write",
                "prospect": "write",
                "budget": "write",
            },
            granular_permissions=invitation.granular_permissions or {},
        )
        self.db.add(member)

        # Mark invitation as accepted
        invitation.accepted_at = datetime.utcnow()

        await self.db.flush()
        return member
