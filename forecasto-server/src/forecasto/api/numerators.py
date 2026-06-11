"""Numerator endpoints — per-workspace consecutive document numbering.

All endpoints authenticate via JWT (`get_current_workspace`), which covers both
the web client and MCP (the MCP client carries the user's OAuth bearer token).
Permissions mirror collections: read / write (reserve+confirm) / create.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import (
    check_numerator_permission,
    get_current_user,
    get_current_workspace,
)
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.numerator import (
    CancelRequest,
    ConfirmRequest,
    NumeratorCreate,
    NumeratorEntryResponse,
    NumeratorResponse,
    NumeratorUpdate,
)
from forecasto.services.event_bus import event_bus
from forecasto.services.numerator_service import NumeratorService

router = APIRouter()

WorkspaceDep = Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)]


# ---------------------------------------------------------------------------
# Numerator CRUD
# ---------------------------------------------------------------------------

@router.post("/{workspace_id}/numerators", response_model=dict, status_code=201)
async def create_numerator(
    workspace_id: str,
    data: NumeratorCreate,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "create")
    service = NumeratorService(db)
    numerator = await service.create_numerator(workspace_id, data, user_id=current_user.id)
    await db.commit()
    await event_bus.publish(
        "numerators_changed",
        workspace_id=workspace_id,
        data={"action": "create", "numerator_id": numerator.id},
    )
    return {"success": True, "numerator": NumeratorResponse.model_validate(numerator)}


@router.get("/{workspace_id}/numerators", response_model=dict)
async def list_numerators(
    workspace_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "read")
    service = NumeratorService(db)
    numerators = await service.list_numerators(workspace_id)
    return {
        "success": True,
        "numerators": [NumeratorResponse.model_validate(n) for n in numerators],
    }


@router.get("/{workspace_id}/numerators/{numerator_id}", response_model=dict)
async def get_numerator(
    workspace_id: str,
    numerator_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "read")
    service = NumeratorService(db)
    numerator = await service.get_numerator(workspace_id, numerator_id)
    return {"success": True, "numerator": NumeratorResponse.model_validate(numerator)}


@router.patch("/{workspace_id}/numerators/{numerator_id}", response_model=dict)
async def update_numerator(
    workspace_id: str,
    numerator_id: str,
    data: NumeratorUpdate,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "create")
    service = NumeratorService(db)
    numerator = await service.update_numerator(workspace_id, numerator_id, data)
    await db.commit()
    await event_bus.publish(
        "numerators_changed",
        workspace_id=workspace_id,
        data={"action": "update", "numerator_id": numerator_id},
    )
    return {"success": True, "numerator": NumeratorResponse.model_validate(numerator)}


@router.delete("/{workspace_id}/numerators/{numerator_id}", response_model=dict)
async def delete_numerator(
    workspace_id: str,
    numerator_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "create")
    service = NumeratorService(db)
    await service.delete_numerator(workspace_id, numerator_id)
    await db.commit()
    await event_bus.publish(
        "numerators_changed",
        workspace_id=workspace_id,
        data={"action": "delete", "numerator_id": numerator_id},
    )
    return {"success": True}


# ---------------------------------------------------------------------------
# History + peek (read)
# ---------------------------------------------------------------------------

@router.get("/{workspace_id}/numerators/{numerator_id}/entries", response_model=dict)
async def list_numerator_entries(
    workspace_id: str,
    numerator_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    _, member = workspace_data
    check_numerator_permission(member, "read")
    service = NumeratorService(db)
    entries, total = await service.list_entries(workspace_id, numerator_id, limit=limit, offset=offset)
    return {
        "success": True,
        "entries": [NumeratorEntryResponse.model_validate(e) for e in entries],
        "total": total,
    }


@router.get("/{workspace_id}/numerators/{numerator_id}/peek", response_model=dict)
async def peek_numerator(
    workspace_id: str,
    numerator_id: str,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "read")
    service = NumeratorService(db)
    result = await service.peek(workspace_id, numerator_id)
    return {"success": True, "result": result}


# ---------------------------------------------------------------------------
# Reserve / confirm / cancel (write)
# ---------------------------------------------------------------------------

@router.post("/{workspace_id}/numerators/{numerator_id}/reserve", response_model=dict)
async def reserve_number(
    workspace_id: str,
    numerator_id: str,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "write")
    service = NumeratorService(db)
    result = await service.reserve(workspace_id, numerator_id, reserved_by=current_user.id)
    await db.commit()
    if result.status in ("issued", "reserved"):
        await event_bus.publish(
            "numerators_changed",
            workspace_id=workspace_id,
            data={"action": result.status, "numerator_id": numerator_id},
        )
    return {"success": True, "result": result}


@router.post("/{workspace_id}/numerators/{numerator_id}/confirm", response_model=dict)
async def confirm_number(
    workspace_id: str,
    numerator_id: str,
    data: ConfirmRequest,
    workspace_data: WorkspaceDep,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "write")
    service = NumeratorService(db)
    result = await service.confirm(workspace_id, numerator_id, data.token, issued_by=current_user.id)
    await db.commit()
    await event_bus.publish(
        "numerators_changed",
        workspace_id=workspace_id,
        data={"action": "confirm", "numerator_id": numerator_id},
    )
    return {"success": True, "result": result}


@router.post("/{workspace_id}/numerators/{numerator_id}/cancel", response_model=dict)
async def cancel_number_reservation(
    workspace_id: str,
    numerator_id: str,
    data: CancelRequest,
    workspace_data: WorkspaceDep,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _, member = workspace_data
    check_numerator_permission(member, "write")
    service = NumeratorService(db)
    released = await service.cancel(workspace_id, numerator_id, data.token)
    await db.commit()
    return {"success": True, "released": released}
