"""Record endpoints."""

from __future__ import annotations


from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import (
    check_area_permission,
    get_current_user,
    get_current_workspace,
)
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.record import (
    RecordCreate,
    RecordFilter,
    RecordResponse,
    RecordUpdate,
)
from forecasto.services.record_service import RecordService

router = APIRouter()

def _record_to_response(record, is_draft: bool = False) -> RecordResponse:
    """Convert record model to response schema."""

    return RecordResponse(
        id=record.id,
        workspace_id=record.workspace_id,
        area=record.area,
        type=record.type,
        account=record.account,
        reference=record.reference,
        note=record.note,
        date_cashflow=record.date_cashflow,
        date_offer=record.date_offer,
        owner=record.owner,
        nextaction=record.nextaction,
        amount=record.amount,
        vat=record.vat,
        total=record.total,
        stage=record.stage,
        transaction_id=record.transaction_id,
        bank_account_id=record.bank_account_id,
        project_code=record.project_code,
        classification=record.classification,
        transfer_history=record.transfer_history,
        version=record.version,
        is_draft=is_draft,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )

@router.get("/{workspace_id}/records", response_model=dict)
async def list_records(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    area: str | None = Query(None),
    date_start: date | None = Query(None),
    date_end: date | None = Query(None),
    sign: str | None = Query(None),
    text_filter: str | None = Query(None),
    project_code: str | None = Query(None),
    bank_account_id: str | None = Query(None),
):
    """List records with filters."""
    workspace, member = workspace_data

    # Check area permission if area specified
    if area:
        check_area_permission(member, area, "read")

    service = RecordService(db)

    filters = RecordFilter(
        area=area,
        date_start=date_start,
        date_end=date_end,
        sign=sign,
        text_filter=text_filter,
        project_code=project_code,
        bank_account_id=bank_account_id,
    )

    records = await service.list_records(workspace_id, filters)

    # Filter by readable areas if no specific area
    if not area:
        readable_areas = [
            a for a, perm in member.area_permissions.items() if perm != "none"
        ]
        records = [r for r in records if r.area in readable_areas]

    return {
        "success": True,
        "records": [_record_to_response(r, getattr(r, "_draft", False)) for r in records],
        "total_records": len(records),
    }

@router.post("/{workspace_id}/records", response_model=dict, status_code=201)
async def create_record(
    workspace_id: str,
    data: RecordCreate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new record."""
    workspace, member = workspace_data
    check_area_permission(member, data.area, "write")

    service = RecordService(db)
    record = await service.create_record(workspace_id, data, current_user)

    return {
        "success": True,
        "record": _record_to_response(record),
    }

@router.get("/{workspace_id}/records/{record_id}", response_model=dict)
async def get_record(
    workspace_id: str,
    record_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get record details."""
    workspace, member = workspace_data

    service = RecordService(db)
    record = await service.get_record(record_id, workspace_id)

    check_area_permission(member, record.area, "read")

    return {"success": True, "record": _record_to_response(record)}

@router.patch("/{workspace_id}/records/{record_id}", response_model=dict)
async def update_record(
    workspace_id: str,
    record_id: str,
    data: RecordUpdate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a record."""
    workspace, member = workspace_data

    service = RecordService(db)
    record = await service.get_record(record_id, workspace_id)

    check_area_permission(member, record.area, "write")

    record = await service.update_record(record, data, current_user)

    return {"success": True, "record": _record_to_response(record)}

@router.delete("/{workspace_id}/records/{record_id}", response_model=dict)
async def delete_record(
    workspace_id: str,
    record_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Soft delete a record."""
    workspace, member = workspace_data

    service = RecordService(db)
    record = await service.get_record(record_id, workspace_id)

    check_area_permission(member, record.area, "write")

    await service.delete_record(record, current_user)

    return {"success": True, "message": "Record deleted"}

@router.get("/{workspace_id}/history", response_model=dict)
async def get_global_history(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, le=500),
):
    """Get global operation history for the workspace."""
    workspace, member = workspace_data

    service = RecordService(db)
    versions = await service.get_global_history(workspace_id, limit)

    return {
        "success": True,
        "history": [
            {
                "id": v.id,
                "record_id": v.record_id,
                "version": v.version,
                "change_type": v.change_type,
                "change_note": v.change_note,
                "changed_at": v.changed_at.isoformat(),
                "changed_by": v.changed_by,
                "snapshot": v.snapshot,
            }
            for v in versions
        ],
    }

@router.get("/{workspace_id}/records/{record_id}/history", response_model=dict)
async def get_record_history(
    workspace_id: str,
    record_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get version history for a specific record."""
    workspace, member = workspace_data

    service = RecordService(db)
    record = await service.get_record(record_id, workspace_id)

    check_area_permission(member, record.area, "read")

    versions = await service.get_history(record)

    return {
        "success": True,
        "history": [
            {
                "id": v.id,
                "version": v.version,
                "change_type": v.change_type,
                "change_note": v.change_note,
                "changed_at": v.changed_at.isoformat(),
                "changed_by": v.changed_by,
                "snapshot": v.snapshot,
            }
            for v in versions
        ],
    }

@router.post("/{workspace_id}/rollback/{version_id}", response_model=dict)
async def rollback_to_version(
    workspace_id: str,
    version_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Rollback all changes after a specific version."""
    workspace, member = workspace_data

    # Admin permission required for rollback
    if member.role not in ["owner", "admin"]:
        from forecasto.exceptions import ForbiddenException
        raise ForbiddenException("Admin permission required for rollback")

    service = RecordService(db)
    restored_records = await service.rollback_to_version(workspace_id, version_id, current_user)

    return {
        "success": True,
        "message": f"Rolled back {len(restored_records)} records",
        "restored_count": len(restored_records),
    }
