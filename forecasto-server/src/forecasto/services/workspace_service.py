"""Workspace service."""

from __future__ import annotations


import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from forecasto.exceptions import ForbiddenException, NotFoundException, ValidationException
from forecasto.models.user import User
from forecasto.models.workspace import Invitation, Workspace, WorkspaceMember
from forecasto.schemas.workspace import InvitationCreate, MemberUpdate, WorkspaceCreate, WorkspaceUpdate
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
            .options(selectinload(Workspace.bank_accounts))
            .order_by(Workspace.name)
        )
        return list(result.all())

    async def create_workspace(self, data: WorkspaceCreate, owner: User) -> Workspace:
        """Create a new workspace."""
        # Check unique name per owner
        result = await self.db.execute(
            select(Workspace).where(
                Workspace.name == data.name,
                Workspace.owner_id == owner.id,
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException(
                f"Workspace '{data.name}' already exists"
            )

        workspace = Workspace(
            name=data.name,
            description=data.description,
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

    async def update_workspace(
        self,
        workspace: Workspace,
        data: WorkspaceUpdate,
        requesting_member: WorkspaceMember,
    ) -> Workspace:
        """Update workspace details. Only owners and admins can update."""
        if requesting_member.role not in ("owner", "admin"):
            raise ForbiddenException("Only owners and admins can update workspaces")

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(workspace, key, value)

        return workspace

    async def get_members(self, workspace_id: str) -> list[WorkspaceMember]:
        """Get all members of a workspace with user relationship eagerly loaded."""
        result = await self.db.execute(
            select(WorkspaceMember)
            .options(selectinload(WorkspaceMember.user))
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

        if data.can_import is not None:
            member.can_import = data.can_import

        if data.can_import_sdi is not None:
            member.can_import_sdi = data.can_import_sdi

        if data.can_export is not None:
            member.can_export = data.can_export

        return member

    async def remove_member(
        self,
        workspace_id: str,
        user_id: str,
        requesting_member: WorkspaceMember,
        current_user: User,
    ) -> None:
        """Remove a member from a workspace."""
        if requesting_member.role not in ("owner", "admin"):
            raise ForbiddenException("Solo owner e admin possono rimuovere membri")

        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            raise NotFoundException(f"Membro {user_id} non trovato nel workspace")

        # Cannot remove owner
        if member.role == "owner":
            raise ForbiddenException("Non puoi rimuovere il proprietario del workspace")

        # Cannot remove yourself (use leave instead)
        if member.user_id == current_user.id:
            raise ForbiddenException("Non puoi rimuovere te stesso dal workspace")

        await self.db.delete(member)
        await self.db.flush()

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

        # Billing profile check: only master users (or admins) can invite
        if not inviter.is_admin:
            if not inviter.billing_profile_id or not inviter.is_billing_master:
                raise ForbiddenException(
                    "Per invitare utenti devi avere un profilo di fatturazione "
                    "ed essere l'utente master del profilo"
                )

        # Resolve target user: by user_id or invite_code
        if data.user_id:
            result = await self.db.execute(
                select(User).where(User.id == data.user_id)
            )
            target_user = result.scalar_one_or_none()
            if not target_user:
                raise NotFoundException(f"Utente {data.user_id} non trovato")

            # If inviting by user_id, verify same billing profile (unless admin)
            if not inviter.is_admin:
                if target_user.billing_profile_id != inviter.billing_profile_id:
                    raise ForbiddenException(
                        "Puoi invitare solo utenti collegati al tuo stesso profilo di fatturazione"
                    )
        else:
            # Look up user by invite_code
            result = await self.db.execute(
                select(User).where(User.invite_code == data.invite_code)
            )
            target_user = result.scalar_one_or_none()
            if not target_user:
                raise NotFoundException(f"Nessun utente trovato con codice {data.invite_code}")

        invite_code = target_user.invite_code

        # Check if already a member (via user_id)
        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == target_user.id,
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException("Utente è già membro di questo workspace")

        # Clean up old invitations (accepted or expired) to avoid UNIQUE constraint conflicts
        old_invitations = await self.db.execute(
            select(Invitation).where(
                Invitation.workspace_id == workspace_id,
                Invitation.invite_code == invite_code,
                (Invitation.accepted_at.isnot(None)) | (Invitation.expires_at <= datetime.utcnow()),
            )
        )
        for old_inv in old_invitations.scalars().all():
            await self.db.delete(old_inv)
        await self.db.flush()

        # Check for existing pending invitation
        result = await self.db.execute(
            select(Invitation).where(
                Invitation.workspace_id == workspace_id,
                Invitation.invite_code == invite_code,
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.utcnow(),
            )
        )
        if result.scalar_one_or_none():
            raise ValidationException("Un invito è già pendente per questo utente")

        # Check max_users limit for billing profile invites
        if inviter.billing_profile_id and not inviter.is_admin:
            from forecasto.models.billing_profile import BillingProfile

            bp_result = await self.db.execute(
                select(BillingProfile).where(BillingProfile.id == inviter.billing_profile_id)
            )
            billing_profile = bp_result.scalar_one_or_none()
            if billing_profile:
                # Check if target user is already a member of any master's workspace
                # If so, they're already counted — no need to check limit
                already_in_master_ws = await self._is_user_in_any_master_workspace(
                    inviter.id, target_user.id
                )
                if not already_in_master_ws:
                    # New user — check limit
                    invited_count = await self._count_master_invited_users(inviter.id)
                    if invited_count >= billing_profile.max_users:
                        raise ForbiddenException(
                            f"Hai raggiunto il limite massimo di {billing_profile.max_users} "
                            f"utenti invitati per il tuo profilo di fatturazione"
                        )

        token = secrets.token_urlsafe(32)
        invitation = Invitation(
            workspace_id=workspace_id,
            invited_by=inviter.id,
            invite_code=invite_code,
            role=data.role,
            area_permissions=data.area_permissions.model_dump() if data.area_permissions else {},
            granular_permissions=data.granular_permissions.model_dump(by_alias=True) if data.granular_permissions else {},
            can_import=data.can_import,
            can_import_sdi=data.can_import_sdi,
            can_export=data.can_export,
            token_hash=hash_password(token),
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        self.db.add(invitation)
        await self.db.flush()

        return invitation

    async def get_invitable_users(
        self, workspace_id: str, current_user: User
    ) -> list[dict]:
        """Get users from the same billing profile that can be invited to workspace."""
        if not current_user.billing_profile_id or not current_user.is_billing_master:
            return []

        # Get users in same billing profile (excluding self)
        result = await self.db.execute(
            select(User).where(
                User.billing_profile_id == current_user.billing_profile_id,
                User.id != current_user.id,
                User.deleted_at.is_(None),
                User.is_blocked == False,  # noqa: E712
            ).order_by(User.name)
        )
        profile_users = result.scalars().all()

        # Get current members and pending invitations for this workspace
        members_result = await self.db.execute(
            select(WorkspaceMember.user_id).where(
                WorkspaceMember.workspace_id == workspace_id
            )
        )
        member_ids = {r[0] for r in members_result.all()}

        pending_result = await self.db.execute(
            select(Invitation.invite_code).where(
                Invitation.workspace_id == workspace_id,
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.utcnow(),
            )
        )
        pending_codes = {r[0] for r in pending_result.all()}

        invitable = []
        for u in profile_users:
            already_member = u.id in member_ids
            has_pending = u.invite_code in pending_codes
            invitable.append({
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "already_member": already_member,
                "has_pending_invitation": has_pending,
            })

        return invitable

    async def _is_user_in_any_master_workspace(
        self, master_user_id: str, target_user_id: str
    ) -> bool:
        """Check if target user is already a member of any workspace owned by master."""
        owner_ws = await self.db.execute(
            select(WorkspaceMember.workspace_id).where(
                WorkspaceMember.user_id == master_user_id,
                WorkspaceMember.role == "owner",
            )
        )
        ws_ids = [r[0] for r in owner_ws.all()]
        if not ws_ids:
            return False

        result = await self.db.execute(
            select(WorkspaceMember.id).where(
                WorkspaceMember.workspace_id.in_(ws_ids),
                WorkspaceMember.user_id == target_user_id,
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _count_master_invited_users(self, master_user_id: str) -> int:
        """Count unique users that are members of any workspace owned by the master."""
        from sqlalchemy import func as sa_func

        # Get all workspaces where master is owner
        owner_ws = await self.db.execute(
            select(WorkspaceMember.workspace_id).where(
                WorkspaceMember.user_id == master_user_id,
                WorkspaceMember.role == "owner",
            )
        )
        ws_ids = [r[0] for r in owner_ws.all()]
        if not ws_ids:
            return 0

        # Count distinct users (excluding master) across those workspaces
        count_result = await self.db.execute(
            select(sa_func.count(sa_func.distinct(WorkspaceMember.user_id))).where(
                WorkspaceMember.workspace_id.in_(ws_ids),
                WorkspaceMember.user_id != master_user_id,
            )
        )
        return count_result.scalar() or 0

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
                "can_import": inv.can_import,
                "can_import_sdi": inv.can_import_sdi,
                "can_export": inv.can_export,
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

        if data.can_import is not None:
            invitation.can_import = data.can_import

        if data.can_import_sdi is not None:
            invitation.can_import_sdi = data.can_import_sdi

        if data.can_export is not None:
            invitation.can_export = data.can_export

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
            can_import=invitation.can_import,
            can_import_sdi=invitation.can_import_sdi,
            can_export=invitation.can_export,
        )
        self.db.add(member)

        # Mark invitation as accepted
        invitation.accepted_at = datetime.utcnow()

        await self.db.flush()
        return member
