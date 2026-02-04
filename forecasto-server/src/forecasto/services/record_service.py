"""Record service."""

from __future__ import annotations


from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import NotFoundException
from forecasto.models.record import Record, RecordVersion
from forecasto.models.session import Session, SessionRecordLock
from forecasto.models.user import User
from forecasto.schemas.record import RecordCreate, RecordFilter, RecordUpdate
from forecasto.services.session_service import SessionService

class RecordService:
    """Service for record operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.session_service = SessionService(db)

    async def create_record(
        self,
        workspace_id: str,
        data: RecordCreate,
        user: User,
        session: Session,
    ) -> Record:
        """Create a new record."""
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

        # Create record version
        await self._create_version(record, user.id, session.id, "create")

        # Add session operation
        await self.session_service.add_operation(
            session=session,
            operation_type="create",
            record=record,
            before_snapshot=None,
            after_snapshot=self._record_to_snapshot(record),
        )

        # Create session lock
        lock = SessionRecordLock(
            session_id=session.id,
            record_id=record.id,
            draft_snapshot=self._record_to_snapshot(record),
            base_version=record.version,
        )
        self.db.add(lock)

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
        session: Session | None = None,
    ) -> list[Record]:
        """List records with filters."""
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

        # Merge with session drafts if provided
        if session:
            result = await self.db.execute(
                select(SessionRecordLock).where(SessionRecordLock.session_id == session.id)
            )
            locks = {lock.record_id: lock for lock in result.scalars().all()}

            # Mark records that have drafts
            for record in records:
                if record.id in locks:
                    record._draft = True  # type: ignore

        return records

    async def update_record(
        self,
        record: Record,
        data: RecordUpdate,
        user: User,
        session: Session,
    ) -> Record:
        """Update a record."""
        before_snapshot = self._record_to_snapshot(record)

        # Apply updates
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if hasattr(record, key):
                setattr(record, key, value)

        record.updated_by = user.id
        record.updated_at = datetime.utcnow()

        after_snapshot = self._record_to_snapshot(record)

        # Create or update session lock
        result = await self.db.execute(
            select(SessionRecordLock).where(
                SessionRecordLock.session_id == session.id,
                SessionRecordLock.record_id == record.id,
            )
        )
        lock = result.scalar_one_or_none()

        if lock:
            lock.draft_snapshot = after_snapshot
        else:
            lock = SessionRecordLock(
                session_id=session.id,
                record_id=record.id,
                draft_snapshot=after_snapshot,
                base_version=record.version,
            )
            self.db.add(lock)

        # Add operation
        await self.session_service.add_operation(
            session=session,
            operation_type="update",
            record=record,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
        )

        return record

    async def delete_record(
        self,
        record: Record,
        user: User,
        session: Session,
    ) -> Record:
        """Soft delete a record."""
        before_snapshot = self._record_to_snapshot(record)

        record.deleted_at = datetime.utcnow()
        record.deleted_by = user.id
        record.version += 1  # Increment version for delete

        after_snapshot = self._record_to_snapshot(record)
        after_snapshot["deleted_at"] = record.deleted_at.isoformat()

        # Add operation
        await self.session_service.add_operation(
            session=session,
            operation_type="delete",
            record=record,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
        )

        # Create version
        await self._create_version(record, user.id, session.id, "delete")

        return record

    async def get_history(self, record: Record) -> list[RecordVersion]:
        """Get version history for a record."""
        result = await self.db.execute(
            select(RecordVersion)
            .where(RecordVersion.record_id == record.id)
            .order_by(RecordVersion.version)
        )
        return list(result.scalars().all())

    async def restore_version(
        self,
        record: Record,
        version_number: int,
        user: User,
        session: Session,
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

        before_snapshot = self._record_to_snapshot(record)

        # Apply snapshot
        self.session_service._apply_snapshot(record, version.snapshot)
        record.updated_by = user.id
        record.updated_at = datetime.utcnow()

        after_snapshot = self._record_to_snapshot(record)

        # Add operation
        await self.session_service.add_operation(
            session=session,
            operation_type="update",
            record=record,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
        )

        # Create version
        await self._create_version(
            record, user.id, session.id, "restore", note or f"Restored to version {version_number}"
        )

        return record

    async def _create_version(
        self,
        record: Record,
        user_id: str,
        session_id: str,
        change_type: str,
        change_note: str | None = None,
    ) -> RecordVersion:
        """Create a version entry for audit trail."""
        version = RecordVersion(
            record_id=record.id,
            version=record.version,
            snapshot=self._record_to_snapshot(record),
            changed_by=user_id,
            session_id=session_id,
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
        }
