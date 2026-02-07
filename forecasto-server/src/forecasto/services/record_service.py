"""Record service."""

from __future__ import annotations


from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import ForbiddenException, NotFoundException
from forecasto.models.record import Record, RecordVersion
from forecasto.models.user import User
from forecasto.models.workspace import WorkspaceMember
from forecasto.schemas.record import RecordCreate, RecordFilter, RecordUpdate


def get_sign_from_amount(amount: Decimal | str | float) -> str:
    """Get sign (in/out) from amount value."""
    if isinstance(amount, str):
        amount = Decimal(amount)
    elif isinstance(amount, float):
        amount = Decimal(str(amount))
    return "in" if amount >= 0 else "out"


def check_granular_permission(
    member: WorkspaceMember,
    area: str,
    sign: str,
    permission: str,
    record_creator_id: str | None = None,
    current_user_id: str | None = None,
) -> bool:
    """
    Check if member has the specified granular permission.

    Args:
        member: The workspace member to check
        area: The area (budget, prospect, orders, actual)
        sign: The sign (in, out)
        permission: The permission to check (can_read_others, can_create, can_edit_others)
        record_creator_id: The user ID who created the record (for edit_others check)
        current_user_id: The current user ID (for edit_others check)

    Returns:
        True if permitted, False otherwise
    """
    # Owner and admin have all permissions
    if member.role in ("owner", "admin"):
        return True

    # Get granular permissions, with fallback to default all-true
    granular = member.granular_permissions or {}
    area_perms = granular.get(area, {})
    sign_perms = area_perms.get(sign, {})

    # Default to True for backwards compatibility
    perm_value = sign_perms.get(permission, True)

    # Special handling for can_edit_others/can_delete_others: if editing/deleting own record, always allowed
    if permission in ("can_edit_others", "can_delete_others"):
        if record_creator_id and current_user_id and record_creator_id == current_user_id:
            return True  # Can always edit/delete own records

    return perm_value


class RecordService:
    """Service for record operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_record(
        self,
        workspace_id: str,
        data: RecordCreate,
        user: User,
        member: WorkspaceMember | None = None,
    ) -> Record:
        """Create a new record."""
        # Check granular permission if member provided
        if member:
            sign = get_sign_from_amount(data.amount)
            if not check_granular_permission(member, data.area, sign, "can_create"):
                raise ForbiddenException(
                    f"You don't have permission to create {sign} records in {data.area}"
                )

        record = Record(
            workspace_id=workspace_id,
            area=data.area,
            type=data.type,
            account=data.account,
            reference=data.reference,
            note=data.note,
            date_cashflow=data.date_cashflow,
            date_offer=data.date_offer,
            owner=data.owner,
            nextaction=data.nextaction,
            amount=data.amount,
            vat=data.vat,
            total=data.total,
            stage=data.stage,
            transaction_id=data.transaction_id,
            bank_account_id=data.bank_account_id,
            project_code=data.project_code,
            created_by=user.id,
            updated_by=user.id,
        )
        self.db.add(record)
        await self.db.flush()

        # Create record version for history
        await self._create_version(record, user.id, "create")

        return record

    async def get_record(self, record_id: str, workspace_id: str) -> Record:
        """Get a record by ID."""
        result = await self.db.execute(
            select(Record).where(
                Record.id == record_id,
                Record.workspace_id == workspace_id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise NotFoundException(f"Record {record_id} not found")
        return record

    async def list_records(
        self,
        workspace_id: str,
        filters: RecordFilter,
        member: WorkspaceMember | None = None,
        current_user_id: str | None = None,
    ) -> list[Record]:
        """List records with filters and permission-based filtering."""
        query = select(Record).where(Record.workspace_id == workspace_id)

        if filters.area:
            query = query.where(Record.area == filters.area)

        if filters.date_start:
            query = query.where(Record.date_cashflow >= filters.date_start)

        if filters.date_end:
            query = query.where(Record.date_cashflow <= filters.date_end)

        if filters.sign == "in":
            query = query.where(Record.amount > 0)
        elif filters.sign == "out":
            query = query.where(Record.amount < 0)

        if filters.text_filter:
            search = f"%{filters.text_filter}%"
            query = query.where(
                or_(
                    Record.account.ilike(search),
                    Record.reference.ilike(search),
                    Record.note.ilike(search),
                )
            )

        if filters.project_code:
            query = query.where(Record.project_code == filters.project_code)

        if filters.bank_account_id:
            query = query.where(Record.bank_account_id == filters.bank_account_id)

        if not filters.include_deleted:
            query = query.where(Record.deleted_at.is_(None))

        query = query.order_by(Record.date_cashflow, Record.created_at)

        result = await self.db.execute(query)
        records = list(result.scalars().all())

        # Apply granular permission filtering if member provided
        if member and current_user_id:
            filtered_records = []
            for record in records:
                sign = get_sign_from_amount(record.amount)
                # Check if user can read this record
                can_read = check_granular_permission(
                    member, record.area, sign, "can_read_others",
                    record.created_by, current_user_id
                )
                # User can always see their own records
                if can_read or record.created_by == current_user_id:
                    filtered_records.append(record)
            records = filtered_records

        return records

    async def update_record(
        self,
        record: Record,
        data: RecordUpdate,
        user: User,
        member: WorkspaceMember | None = None,
    ) -> Record:
        """Update a record."""
        # Check granular permission if member provided
        if member:
            sign = get_sign_from_amount(record.amount)
            if not check_granular_permission(
                member, record.area, sign, "can_edit_others",
                record.created_by, user.id
            ):
                raise ForbiddenException(
                    f"You don't have permission to edit records created by others in {record.area}"
                )

        # Apply updates
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if hasattr(record, key):
                setattr(record, key, value)

        record.updated_by = user.id
        record.updated_at = datetime.utcnow()
        record.version += 1

        # Create version for history
        await self._create_version(record, user.id, "update")

        return record

    async def delete_record(
        self,
        record: Record,
        user: User,
        member: WorkspaceMember | None = None,
    ) -> Record:
        """Soft delete a record."""
        # Check granular permission if member provided
        if member:
            sign = get_sign_from_amount(record.amount)
            if not check_granular_permission(
                member, record.area, sign, "can_delete_others",
                record.created_by, user.id
            ):
                raise ForbiddenException(
                    f"You don't have permission to delete records created by others in {record.area}"
                )

        record.deleted_at = datetime.utcnow()
        record.deleted_by = user.id
        record.version += 1

        # Create version for history
        await self._create_version(record, user.id, "delete")

        return record

    async def get_history(self, record: Record) -> list[RecordVersion]:
        """Get version history for a record."""
        result = await self.db.execute(
            select(RecordVersion)
            .where(RecordVersion.record_id == record.id)
            .order_by(RecordVersion.version)
        )
        return list(result.scalars().all())

    async def get_global_history(
        self,
        workspace_id: str,
        limit: int = 100,
    ) -> list[RecordVersion]:
        """Get global operation history for a workspace."""
        result = await self.db.execute(
            select(RecordVersion)
            .join(Record)
            .where(Record.workspace_id == workspace_id)
            .order_by(RecordVersion.changed_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def clear_history(self, workspace_id: str) -> int:
        """Delete all version history entries for a workspace."""
        from sqlalchemy import delete as sql_delete
        result = await self.db.execute(
            sql_delete(RecordVersion)
            .where(
                RecordVersion.record_id.in_(
                    select(Record.id).where(Record.workspace_id == workspace_id)
                )
            )
        )
        return result.rowcount

    async def restore_version(
        self,
        record: Record,
        version_number: int,
        user: User,
        note: str | None = None,
    ) -> Record:
        """Restore record to a previous version."""
        result = await self.db.execute(
            select(RecordVersion).where(
                RecordVersion.record_id == record.id,
                RecordVersion.version == version_number,
            )
        )
        version = result.scalar_one_or_none()

        if not version:
            raise NotFoundException(f"Version {version_number} not found")

        # Apply snapshot
        self._apply_snapshot(record, version.snapshot)
        record.updated_by = user.id
        record.updated_at = datetime.utcnow()
        record.version += 1

        # Create version for history
        await self._create_version(
            record, user.id, "restore", note or f"Restored to version {version_number}"
        )

        return record

    async def rollback_to_version(
        self,
        workspace_id: str,
        version_id: str,
        user: User,
    ) -> list[Record]:
        """Rollback all changes after a specific version in a workspace."""
        # Get the target version
        result = await self.db.execute(
            select(RecordVersion).where(RecordVersion.id == version_id)
        )
        target_version = result.scalar_one_or_none()
        if not target_version:
            raise NotFoundException(f"Version {version_id} not found")

        # Get all versions after this one in the workspace
        result = await self.db.execute(
            select(RecordVersion)
            .join(Record)
            .where(
                Record.workspace_id == workspace_id,
                RecordVersion.changed_at > target_version.changed_at,
            )
            .order_by(RecordVersion.changed_at.desc())
        )
        versions_to_rollback = list(result.scalars().all())

        restored_records = []
        processed_record_ids = set()

        # Group versions by record and restore each to the state before the rollback point
        for ver in versions_to_rollback:
            if ver.record_id in processed_record_ids:
                continue

            record = await self.get_record(ver.record_id, workspace_id)

            # Find the version just before or at the target time for this record
            result = await self.db.execute(
                select(RecordVersion)
                .where(
                    RecordVersion.record_id == ver.record_id,
                    RecordVersion.changed_at <= target_version.changed_at,
                )
                .order_by(RecordVersion.changed_at.desc())
                .limit(1)
            )
            restore_to = result.scalar_one_or_none()

            if restore_to:
                # Record existed at rollback point — restore its state
                self._apply_snapshot(record, restore_to.snapshot)
                record.updated_by = user.id
                record.updated_at = datetime.utcnow()
                record.version += 1
                await self._create_version(record, user.id, "rollback", f"Rollback to {target_version.changed_at}")
                restored_records.append(record)
            else:
                # No version before rollback point — check if record was
                # actually created after it (vs history simply cleared)
                earliest_result = await self.db.execute(
                    select(RecordVersion)
                    .where(RecordVersion.record_id == ver.record_id)
                    .order_by(RecordVersion.changed_at.asc())
                    .limit(1)
                )
                earliest_version = earliest_result.scalar_one_or_none()

                if earliest_version and earliest_version.change_type == "create" and earliest_version.changed_at > target_version.changed_at:
                    # Record was truly created after the rollback point — soft delete
                    record.deleted_at = datetime.utcnow()
                    record.deleted_by = user.id
                    record.version += 1
                    await self._create_version(record, user.id, "rollback", f"Rollback: record created after {target_version.changed_at}")
                    restored_records.append(record)
                # else: history was cleared, no prior state — leave record as-is

            processed_record_ids.add(ver.record_id)

        return restored_records

    async def _create_version(
        self,
        record: Record,
        user_id: str,
        change_type: str,
        change_note: str | None = None,
    ) -> RecordVersion:
        """Create a version entry for audit trail."""
        version = RecordVersion(
            record_id=record.id,
            version=record.version,
            snapshot=self._record_to_snapshot(record),
            changed_by=user_id,
            change_type=change_type,
            change_note=change_note,
        )
        self.db.add(version)
        return version

    def _record_to_snapshot(self, record: Record) -> dict[str, Any]:
        """Convert record to snapshot dict."""
        return {
            "area": record.area,
            "type": record.type,
            "account": record.account,
            "reference": record.reference,
            "note": record.note,
            "date_cashflow": record.date_cashflow.isoformat() if record.date_cashflow else None,
            "date_offer": record.date_offer.isoformat() if record.date_offer else None,
            "owner": record.owner,
            "nextaction": record.nextaction,
            "amount": str(record.amount),
            "vat": str(record.vat),
            "total": str(record.total),
            "stage": record.stage,
            "transaction_id": record.transaction_id,
            "bank_account_id": record.bank_account_id,
            "project_code": record.project_code,
            "deleted_at": record.deleted_at.isoformat() if record.deleted_at else None,
        }

    def _apply_snapshot(self, record: Record, snapshot: dict[str, Any]) -> None:
        """Apply a snapshot to a record."""
        from datetime import date as date_type
        from decimal import Decimal

        record.area = snapshot.get("area", record.area)
        record.type = snapshot.get("type", record.type)
        record.account = snapshot.get("account", record.account)
        record.reference = snapshot.get("reference", record.reference)
        record.note = snapshot.get("note")
        record.owner = snapshot.get("owner")
        record.nextaction = snapshot.get("nextaction")
        record.stage = snapshot.get("stage", record.stage)
        record.transaction_id = snapshot.get("transaction_id")
        record.bank_account_id = snapshot.get("bank_account_id")
        record.project_code = snapshot.get("project_code")

        if snapshot.get("date_cashflow"):
            record.date_cashflow = date_type.fromisoformat(snapshot["date_cashflow"])
        if snapshot.get("date_offer"):
            record.date_offer = date_type.fromisoformat(snapshot["date_offer"])
        if snapshot.get("amount"):
            record.amount = Decimal(snapshot["amount"])
        if snapshot.get("vat"):
            record.vat = Decimal(snapshot["vat"])
        if snapshot.get("total"):
            record.total = Decimal(snapshot["total"])

        # Handle deleted_at for restore from delete
        if snapshot.get("deleted_at"):
            record.deleted_at = datetime.fromisoformat(snapshot["deleted_at"])
        else:
            record.deleted_at = None
