"""Cashflow endpoints."""

from __future__ import annotations


from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.models.vat_registry import VatRegistry
from forecasto.schemas.cashflow import (
    CashflowRequest,
    CashflowResponse,
    CashflowVatEntry,
    CashflowVatResponse,
    CashflowVatSeries,
)
from forecasto.services.cashflow_service import CashflowService
from forecasto.services.vat_service import VatService

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
    area_stage: list[str] | None = Query(None),
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
        area_stage=area_stage,
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


@router.get("/cashflow/vat-simulation", response_model=CashflowVatResponse)
async def get_vat_simulation(
    workspace_ids: list[str] = Query(...),
    from_date: date = Query(...),
    to_date: date = Query(...),
    current_user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    period_type: str = Query("monthly"),
    use_summer_extension: bool = Query(True),
    area_stage: list[str] | None = Query(None),
):
    """Calculate VAT simulation series for cashflow overlay.

    Groups workspaces by their vat_registry_id and returns one series per P.IVA.
    """
    # 1. Find registries for the given workspaces
    result = await db.execute(
        select(Workspace.id, Workspace.vat_registry_id)
        .where(
            Workspace.id.in_(workspace_ids),
            Workspace.vat_registry_id.isnot(None),
        )
    )
    ws_registry_map = {row[0]: row[1] for row in result.fetchall()}

    # Group workspace_ids by registry
    registry_workspaces: dict[str, list[str]] = defaultdict(list)
    for ws_id, reg_id in ws_registry_map.items():
        registry_workspaces[reg_id].append(ws_id)

    if not registry_workspaces:
        return CashflowVatResponse(series=[])

    # 2. Fetch registry details
    reg_result = await db.execute(
        select(VatRegistry).where(VatRegistry.id.in_(list(registry_workspaces.keys())))
    )
    registries = {r.id: r for r in reg_result.scalars().all()}

    # 3. Calculate VAT for each registry
    vat_service = VatService(db)
    series_list: list[CashflowVatSeries] = []

    for reg_id, ws_ids in registry_workspaces.items():
        registry = registries.get(reg_id)
        if not registry:
            continue

        period_results = await vat_service.calculate_for_cashflow(
            registry=registry,
            workspace_ids=ws_ids,
            from_date=from_date,
            to_date=to_date,
            period_type=period_type,
            use_summer_extension=use_summer_extension,
            area_stage=area_stage,
        )

        entries = [
            CashflowVatEntry(
                date=p.date_cashflow,
                period=p.period,
                area=p.area,
                iva_debito=p.iva_debito,
                iva_credito=p.iva_credito,
                credit_carried=p.credit_carried,
                net=p.net,
            )
            for p in period_results
        ]

        total_debito = sum((e.iva_debito for e in entries), Decimal("0"))
        total_credito = sum((e.iva_credito for e in entries), Decimal("0"))
        total_net = sum((e.net for e in entries), Decimal("0"))

        series_list.append(CashflowVatSeries(
            vat_registry_id=reg_id,
            vat_number=registry.vat_number,
            name=registry.name,
            bank_account_id=registry.bank_account_id,
            entries=entries,
            total_debito=total_debito,
            total_credito=total_credito,
            total_net=total_net,
        ))

    return CashflowVatResponse(series=series_list)
