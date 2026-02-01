"""Cashflow endpoints."""

from __future__ import annotations


from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.cashflow import CashflowRequest, CashflowResponse
from forecasto.services.cashflow_service import CashflowService

router = APIRouter()

@router.get("/workspaces/{workspace_id}/cashflow", response_model=CashflowResponse)
async def get_cashflow(
    workspace_id: str,
    from_date: date,
    to_date: date,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    areas: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    bank_account_id: str | None = Query(None),
    group_by: str = Query("day"),
    sign_filter: str | None = Query(None),
):
    """Calculate cashflow projection for a workspace."""

    params = CashflowRequest(
        from_date=from_date,
        to_date=to_date,
        areas=areas,
        stages=stages,
        bank_account_id=bank_account_id,
        group_by=group_by,
        sign_filter=sign_filter,
    )

    service = CashflowService(db)
    return await service.calculate_cashflow(workspace_id, params)

@router.get("/cashflow/consolidated", response_model=CashflowResponse)
async def get_consolidated_cashflow(
    workspace_ids: list[str],
    from_date: date,
    to_date: date,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    group_by: str = Query("day"),
):
    """Calculate consolidated cashflow across multiple workspaces."""
    service = CashflowService(db)
    return await service.calculate_consolidated_cashflow(
        workspace_ids, from_date, to_date, current_user.id
    )
