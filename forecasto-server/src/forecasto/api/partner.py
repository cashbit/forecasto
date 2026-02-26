"""Partner API endpoints for viewing assigned registration codes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import require_partner
from forecasto.exceptions import ForbiddenException, NotFoundException
from forecasto.models.registration_code import RegistrationCodeBatch
from forecasto.models.user import User
from forecasto.schemas.admin import UpdateCodeRecipientRequest
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


@router.patch("/batches/{batch_id}/codes/{code_id}/recipient", response_model=dict)
async def update_partner_code_recipient(
    batch_id: str,
    code_id: str,
    data: UpdateCodeRecipientRequest,
    partner_user: Annotated[User, Depends(require_partner)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update recipient name and email for a code in a partner-owned batch."""
    # Verify batch belongs to this partner
    result = await db.execute(
        select(RegistrationCodeBatch).where(RegistrationCodeBatch.id == batch_id)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise NotFoundException(f"Batch {batch_id} not found")
    if batch.partner_id != partner_user.id:
        raise ForbiddenException("Non sei autorizzato a modificare questo batch")

    service = AdminService(db)
    code = await service.update_code_recipient(code_id, data.recipient_name, data.recipient_email)
    return {"success": True, "code": code}
