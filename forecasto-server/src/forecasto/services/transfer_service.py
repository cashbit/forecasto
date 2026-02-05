"""Transfer service for moving records between areas."""

from __future__ import annotations


from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import InvalidTransferException
from forecasto.models.record import Record, RecordVersion
from forecasto.models.user import User

VALID_AREAS = ["budget", "prospect", "orders", "actual"]

class TransferService:
    """Service for record transfer operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def transfer_record(
        self,
        record: Record,
        to_area: str,
        user: User,
        note: str | None = None,
    ) -> Record:
        """Transfer a record from one area to another."""
        if to_area not in VALID_AREAS:
            raise InvalidTransferException(f"Invalid target area: {to_area}")

        if record.area == to_area:
            raise InvalidTransferException("Record is already in the target area")

        from_area = record.area

        # Update area
        record.area = to_area
        record.updated_by = user.id
        record.updated_at = datetime.utcnow()
        record.version += 1

        # Add to transfer history
        transfer_entry = {
            "from_area": from_area,
            "to_area": to_area,
            "transferred_at": datetime.utcnow().isoformat(),
            "transferred_by": user.id,
            "note": note,
        }
        history = list(record.transfer_history)
        history.append(transfer_entry)
        record.transfer_history = history

        # Create version for history
        await self._create_version(
            record, user.id, "transfer", f"Transferred from {from_area} to {to_area}"
        )

        return record

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

    def _record_to_snapshot(self, record: Record) -> dict:
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
            "transfer_history": record.transfer_history,
            "deleted_at": record.deleted_at.isoformat() if record.deleted_at else None,
        }
