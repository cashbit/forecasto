"""User service."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from forecasto.exceptions import ConflictException, NotFoundException, UnauthorizedException, ValidationException
from forecasto.models.audit import AuditLog
from forecasto.models.bank_account import BankAccount, BankAccountBalance
from forecasto.models.oauth import OAuthAuthorizationCode
from forecasto.models.record import Record
from forecasto.models.registration_code import RegistrationCode, RegistrationCodeBatch
from forecasto.models.session import Session
from forecasto.models.user import EmailVerificationToken, RefreshToken, User
from forecasto.models.vat_registry import VatRegistry
from forecasto.models.workspace import Invitation, Workspace, WorkspaceMember, workspace_bank_accounts
from forecasto.schemas.user import UserUpdate
from forecasto.utils.security import hash_password, verify_password


def _decimal(v: Any) -> float | None:
    """Convert Decimal to float for JSON serialization."""
    if v is None:
        return None
    return float(v) if isinstance(v, Decimal) else v


class UserService:
    """Service for user operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user(self, user_id: str) -> User:
        """Get user by ID."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundException(f"User {user_id} not found")
        return user

    async def update_user(self, user: User, data: UserUpdate) -> User:
        """Update user profile."""
        if data.name is not None:
            user.name = data.name
        if data.notification_preferences is not None:
            user.notification_preferences = data.notification_preferences
        if data.ui_preferences is not None:
            user.ui_preferences = data.ui_preferences

        return user

    async def change_password(self, user: User, current_password: str, new_password: str) -> User:
        """Change user password after verifying the current one."""
        if not verify_password(current_password, user.password_hash):
            raise UnauthorizedException("Password attuale non corretta")
        user.password_hash = hash_password(new_password)
        return user

    async def verify_email(self, user: User) -> User:
        """Mark user email as verified."""
        user.email_verified = True
        return user

    # ── GDPR: Account Deletion ──────────────────────────────────────

    async def precheck_deletion(self, user: User) -> dict:
        """Check whether the user can delete their account.

        Returns a dict matching DeleteAccountPrecheck schema.
        Blocks deletion if the user owns workspaces with other members
        (they must transfer ownership first).
        """
        # Get all workspaces owned by this user
        result = await self.db.execute(
            select(Workspace).where(Workspace.owner_id == user.id)
        )
        owned_workspaces = result.scalars().all()

        owned_with_members: list[dict] = []
        owned_solo: list[dict] = []

        for ws in owned_workspaces:
            # Count members
            member_count_result = await self.db.execute(
                select(func.count()).select_from(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == ws.id
                )
            )
            member_count = member_count_result.scalar() or 0

            # Count records
            record_count_result = await self.db.execute(
                select(func.count()).select_from(Record).where(
                    Record.workspace_id == ws.id,
                    Record.deleted_at.is_(None),
                )
            )
            record_count = record_count_result.scalar() or 0

            ws_info = {
                "id": ws.id,
                "name": ws.name,
                "member_count": member_count,
                "record_count": record_count,
            }

            if member_count > 1:
                owned_with_members.append(ws_info)
            else:
                owned_solo.append(ws_info)

        # Count bank accounts and VAT registries
        ba_count_result = await self.db.execute(
            select(func.count()).select_from(BankAccount).where(
                BankAccount.owner_id == user.id
            )
        )
        ba_count = ba_count_result.scalar() or 0

        vr_count_result = await self.db.execute(
            select(func.count()).select_from(VatRegistry).where(
                VatRegistry.owner_id == user.id
            )
        )
        vr_count = vr_count_result.scalar() or 0

        can_delete = len(owned_with_members) == 0

        if not can_delete:
            ws_names = ", ".join(w["name"] for w in owned_with_members)
            message = (
                f"Devi trasferire la proprietà dei seguenti workspace prima di "
                f"poter cancellare il tuo account: {ws_names}"
            )
        else:
            message = "Il tuo account può essere cancellato."

        return {
            "can_delete": can_delete,
            "owned_workspaces_with_members": owned_with_members,
            "owned_workspaces_solo": owned_solo,
            "bank_accounts_count": ba_count,
            "vat_registries_count": vr_count,
            "message": message,
        }

    async def export_user_data(self, user: User) -> dict:
        """Export all user data for GDPR Art. 20 data portability."""
        export: dict[str, Any] = {
            "export_date": datetime.utcnow().isoformat(),
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "invite_code": user.invite_code,
                "email_verified": user.email_verified,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
                "notification_preferences": user.notification_preferences,
                "ui_preferences": user.ui_preferences,
                "is_partner": user.is_partner,
                "partner_type": user.partner_type,
            },
        }

        # Workspace memberships
        result = await self.db.execute(
            select(WorkspaceMember)
            .options(selectinload(WorkspaceMember.workspace))
            .where(WorkspaceMember.user_id == user.id)
        )
        memberships = result.scalars().all()
        export["workspaces"] = []

        for m in memberships:
            ws = m.workspace
            ws_data: dict[str, Any] = {
                "id": ws.id,
                "name": ws.name,
                "role": m.role,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
                "area_permissions": m.area_permissions,
            }

            # Export records for this workspace
            records_result = await self.db.execute(
                select(Record).where(
                    Record.workspace_id == ws.id,
                    Record.deleted_at.is_(None),
                )
            )
            records = records_result.scalars().all()
            ws_data["records"] = [
                {
                    "id": r.id,
                    "area": r.area,
                    "type": r.type,
                    "account": r.account,
                    "reference": r.reference,
                    "note": r.note,
                    "date_cashflow": r.date_cashflow.isoformat() if r.date_cashflow else None,
                    "date_offer": r.date_offer.isoformat() if r.date_offer else None,
                    "amount": _decimal(r.amount),
                    "vat": _decimal(r.vat),
                    "total": _decimal(r.total),
                    "stage": r.stage,
                    "owner": r.owner,
                    "project_code": r.project_code,
                }
                for r in records
            ]

            export["workspaces"].append(ws_data)

        # Bank accounts
        ba_result = await self.db.execute(
            select(BankAccount).where(BankAccount.owner_id == user.id)
        )
        bank_accounts = ba_result.scalars().all()
        export["bank_accounts"] = [
            {
                "id": ba.id,
                "name": ba.name,
                "bank_name": ba.bank_name,
                "currency": ba.currency,
                "credit_limit": _decimal(ba.credit_limit),
            }
            for ba in bank_accounts
        ]

        # VAT registries
        vr_result = await self.db.execute(
            select(VatRegistry).where(VatRegistry.owner_id == user.id)
        )
        vat_registries = vr_result.scalars().all()
        export["vat_registries"] = [
            {
                "id": vr.id,
                "name": vr.name,
                "vat_number": vr.vat_number,
            }
            for vr in vat_registries
        ]

        return export

    async def delete_account(self, user: User, password: str) -> None:
        """Delete (anonymize) user account per GDPR Art. 17.

        - Verifies password
        - Blocks if user owns workspaces with other members
        - Deletes sole-owner workspaces (cascade: records, sessions, etc.)
        - Anonymizes remaining references
        - Scrubs PII from user row
        """
        # 1. Verify password (use ValidationException so client can distinguish
        #    wrong-password from session-expired, which both would be 401)
        if not verify_password(password, user.password_hash):
            raise ValidationException("Password non corretta")

        # 2. Pre-check
        precheck = await self.precheck_deletion(user)
        if not precheck["can_delete"]:
            raise ConflictException(
                precheck["message"],
                details={"workspaces": precheck["owned_workspaces_with_members"]},
            )

        user_id = user.id

        # 3. Delete sole-owner workspaces (cascade handles records, sessions, invitations, API keys, members)
        solo_ws_ids = [w["id"] for w in precheck["owned_workspaces_solo"]]
        if solo_ws_ids:
            await self.db.execute(
                delete(Workspace).where(Workspace.id.in_(solo_ws_ids))
            )

        # 4. SET NULL on Record audit FKs in surviving records
        await self.db.execute(
            update(Record).where(Record.created_by == user_id).values(created_by=None)
        )
        await self.db.execute(
            update(Record).where(Record.updated_by == user_id).values(updated_by=None)
        )
        await self.db.execute(
            update(Record).where(Record.deleted_by == user_id).values(deleted_by=None)
        )

        # 5. Handle BankAccounts owned by user
        ba_result = await self.db.execute(
            select(BankAccount).where(BankAccount.owner_id == user_id)
        )
        user_bank_accounts = ba_result.scalars().all()

        for ba in user_bank_accounts:
            # Check if this bank account is linked to any surviving workspace
            link_count_result = await self.db.execute(
                select(func.count()).select_from(workspace_bank_accounts).where(
                    workspace_bank_accounts.c.bank_account_id == ba.id
                )
            )
            link_count = link_count_result.scalar() or 0

            # Also check if it's set as primary on any surviving workspace
            primary_count_result = await self.db.execute(
                select(func.count()).select_from(Workspace).where(
                    Workspace.bank_account_id == ba.id
                )
            )
            primary_count = primary_count_result.scalar() or 0

            if link_count > 0 or primary_count > 0:
                # Keep the account but remove ownership
                ba.owner_id = None
            else:
                # Delete (cascade removes balances)
                await self.db.delete(ba)

        # 6. SET NULL on BankAccountBalance.recorded_by
        await self.db.execute(
            update(BankAccountBalance)
            .where(BankAccountBalance.recorded_by == user_id)
            .values(recorded_by=None)
        )

        # 7. Handle VatRegistries owned by user
        # First unlink from surviving workspaces
        await self.db.execute(
            update(Workspace)
            .where(
                Workspace.vat_registry_id.in_(
                    select(VatRegistry.id).where(VatRegistry.owner_id == user_id)
                )
            )
            .values(vat_registry_id=None)
        )
        # Then delete the registries (cascade deletes VatBalance rows)
        await self.db.execute(
            delete(VatRegistry).where(VatRegistry.owner_id == user_id)
        )

        # 8. Delete orphaned Invitations created by this user in other workspaces
        await self.db.execute(
            delete(Invitation).where(Invitation.invited_by == user_id)
        )

        # 9. Anonymize AuditLog
        await self.db.execute(
            update(AuditLog)
            .where(AuditLog.user_id == user_id)
            .values(user_id=None, ip_address=None, user_agent=None)
        )

        # 10. SET NULL on RegistrationCode/Batch FKs
        await self.db.execute(
            update(RegistrationCode)
            .where(RegistrationCode.used_by_id == user_id)
            .values(used_by_id=None)
        )
        await self.db.execute(
            update(RegistrationCodeBatch)
            .where(RegistrationCodeBatch.created_by_id == user_id)
            .values(created_by_id=None)
        )
        await self.db.execute(
            update(RegistrationCodeBatch)
            .where(RegistrationCodeBatch.partner_id == user_id)
            .values(partner_id=None)
        )

        # 11. Delete tokens, sessions, memberships
        await self.db.execute(
            delete(RefreshToken).where(RefreshToken.user_id == user_id)
        )
        await self.db.execute(
            delete(OAuthAuthorizationCode).where(OAuthAuthorizationCode.user_id == user_id)
        )
        await self.db.execute(
            delete(EmailVerificationToken).where(EmailVerificationToken.user_id == user_id)
        )
        # Delete sessions in workspaces the user doesn't own (surviving workspaces)
        await self.db.execute(
            delete(Session).where(Session.user_id == user_id)
        )
        await self.db.execute(
            delete(WorkspaceMember).where(WorkspaceMember.user_id == user_id)
        )

        # 12. Anonymize User row
        user.email = f"deleted-{user_id}@deleted.local"
        user.name = "Utente Cancellato"
        user.password_hash = ""
        user.invite_code = f"DEL-{user_id[:8]}"
        user.email_verified = False
        user.notification_preferences = {}
        user.ui_preferences = {}
        user.is_blocked = True
        user.blocked_reason = "GDPR_DELETION"
        user.blocked_at = datetime.utcnow()
        user.deleted_at = datetime.utcnow()
        user.last_login_at = None
        user.is_admin = False
        user.is_partner = False
        user.partner_type = None
        user.must_change_password = False

        await self.db.flush()
