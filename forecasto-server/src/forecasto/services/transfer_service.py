"""Transfer service for moving records between areas."""

from __future__ import annotations


from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.exceptions import InvalidTransferException
from forecasto.models.record import Record
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

        return record
