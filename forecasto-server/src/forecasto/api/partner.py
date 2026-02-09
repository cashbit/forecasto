"""Partner API endpoints for viewing assigned registration codes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import require_partner
from forecasto.models.user import User
from forecasto.services.admin_service import AdminService

router = APIRouter()


@router.get("/batches", response_model=dict)
async def list_partner_batches(
    partner_user: Annotated[User, Depends(require_partner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List batches assigned to the current partner."""
    service = AdminService(db)
    batches = await service.list_partner_batches(partner_user.id)
    return {"success": True, "batches": batches}


@router.get("/batches/{batch_id}", response_model=dict)
async def get_partner_batch(
    batch_id: str,
    partner_user: Annotated[User, Depends(require_partner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a specific batch with codes (only if assigned to this partner)."""
    service = AdminService(db)
    batch = await service.get_partner_batch(batch_id, partner_user.id)
    return {"success": True, "batch": batch}
