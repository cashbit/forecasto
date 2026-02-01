"""Transfer service for moving records between areas."""

from __future__ import annotations


from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import InvalidTransferException
from forecasto.models.record import Record
from forecasto.models.session import Session, SessionRecordLock
from forecasto.models.user import User
from forecasto.services.session_service import SessionService

VALID_AREAS = ["budget", "prospect", "orders", "actual"]

class TransferService:
    """Service for record transfer operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.session_service = SessionService(db)

    async def transfer_record(
        self,
        record: Record,
        to_area: str,
        user: User,
        session: Session,
        note: str | None = None,
    ) -> Record:
        """Transfer a record from one area to another."""
        if to_area not in VALID_AREAS:
            raise InvalidTransferException(f"Invalid target area: {to_area}")

        if record.area == to_area:
            raise InvalidTransferException("Record is already in the target area")

        from_area = record.area
        before_snapshot = self._record_to_snapshot(record)

        # Update area
        record.area = to_area
        record.updated_by = user.id
        record.updated_at = datetime.utcnow()

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

        after_snapshot = self._record_to_snapshot(record)

        # Add operation
        await self.session_service.add_operation(
            session=session,
            operation_type="transfer",
            record=record,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
            from_area=from_area,
            to_area=to_area,
        )

        return record

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
            "amount": str(record.amount),
            "vat": str(record.vat),
            "total": str(record.total),
            "stage": record.stage,
            "transaction_id": record.transaction_id,
            "bank_account_id": record.bank_account_id,
            "project_id": record.project_id,
            "phase_id": record.phase_id,
            "transfer_history": record.transfer_history,
        }
