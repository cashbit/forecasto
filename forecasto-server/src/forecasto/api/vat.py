"""VAT (IVA) calculation endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user
from forecasto.models.user import User
from forecasto.schemas.vat import VatCalculationRequest, VatCalculationResponse
from forecasto.services.event_bus import event_bus
from forecasto.services.vat_service import VatService

router = APIRouter()


@router.post("/vat/calculate", response_model=VatCalculationResponse)
async def calculate_vat(
    data: VatCalculationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    dry_run: bool = Query(False, description="If true, only preview without creating records"),
):
    """Calculate Italian periodic VAT (IVA) and create settlement records.

    Uses a VatRegistry to automatically find all linked workspaces and calculate
    per-area settlement with global credit carry-forward.
    """
    service = VatService(db)
    result = await service.calculate(data, current_user, dry_run=dry_run)
    if not dry_run:
        await event_bus.publish("vat_changed", data={"action": "calculate"})
        await event_bus.publish("records_changed", data={"action": "vat_settlement"})
    return result
