"""VAT (IVA) calculation endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user
from forecasto.models.user import User
from forecasto.models.workspace import WorkspaceMember
from forecasto.exceptions import ForbiddenException, NotFoundException
from forecasto.schemas.vat import VatCalculationRequest, VatCalculationResponse
from forecasto.services.vat_service import VatService
from sqlalchemy import select

router = APIRouter()


async def _check_workspace_access(db: AsyncSession, user: User, workspace_id: str, need_write: bool = False) -> None:
    """Verify user has access to a workspace."""
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise NotFoundException(f"Workspace {workspace_id} not found or no access")
    if need_write and member.role == "viewer":
        raise ForbiddenException("Write access required for target workspace")


@router.post("/vat/calculate", response_model=VatCalculationResponse)
async def calculate_vat(
    data: VatCalculationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    dry_run: bool = Query(False, description="If true, only preview without creating records"),
):
    """Calculate Italian periodic VAT (IVA) and create settlement records.

    Aggregates IVA a debito (from sales) and IVA a credito (from purchases)
    across source workspaces, then creates net payment records in the target workspace.
    """
    # Validate workspace access
    for ws_id in data.source_workspace_ids:
        await _check_workspace_access(db, current_user, ws_id, need_write=False)
    await _check_workspace_access(db, current_user, data.target_workspace_id, need_write=True)

    service = VatService(db)
    return await service.calculate(data, current_user, dry_run=dry_run)
