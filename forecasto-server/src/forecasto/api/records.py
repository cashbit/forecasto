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
    """Convert record model to response schema, enriching with audit user info."""
    response = RecordResponse.model_validate(record)
    response.is_draft = is_draft
    response.creator_email = record.creator.email if record.creator else None
    response.updater_email = record.updater.email if record.updater else None
    response.deleter_email = record.deleter.email if record.deleter else None
    response.bank_account_name = record.bank_account.name if record.bank_account else None
    return response

@router.get("/{workspace_id}/records", response_model=dict)
async def list_records(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    area: str | None = Query(None),
    date_start: date | None = Query(None),
    date_end: date | None = Query(None),
    sign: str | None = Query(None),
    text_filter: str | None = Query(None),
    text_filter_field: str | None = Query(None),
    project_code: str | None = Query(None),
    bank_account_id: str | None = Query(None),
    include_deleted: bool = Query(False),
    limit: int | None = Query(None, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """List records with filters and optional pagination."""
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
        text_filter_field=text_filter_field,
        project_code=project_code,
        bank_account_id=bank_account_id,
        include_deleted=include_deleted,
    )

    # Pass member and current_user_id for granular permission filtering
    records, total = await service.list_records(
        workspace_id, filters, member=member, current_user_id=current_user.id,
        limit=limit, offset=offset,
    )

    # Filter by readable areas if no specific area
    if not area:
        readable_areas = [
            a for a, perm in member.area_permissions.items() if perm != "none"
        ]
        records = [r for r in records if r.area in readable_areas]

    result = {
        "success": True,
        "records": [_record_to_response(r, getattr(r, "_draft", False)) for r in records],
        "total_records": total,
    }
    if limit is not None:
        result["limit"] = limit
        result["offset"] = offset
        result["has_more"] = (offset + len(records)) < total
    return result

@router.get("/{workspace_id}/records/field-values", response_model=dict)
async def get_field_values(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    field: str = Query(..., description="Campo: account, reference, project_code"),
    q: str | None = Query(None, description="Stringa di ricerca opzionale"),
    limit: int = Query(20, ge=1, le=100),
):
    """Return distinct values for a field in the workspace (autocomplete)."""
    allowed = {"account", "reference", "project_code"}
    if field not in allowed:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Field '{field}' not supported. Allowed: {sorted(allowed)}")

    service = RecordService(db)
    values = await service.get_field_values(workspace_id, field, q=q, limit=limit)
    return {"success": True, "values": values}


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
    # Pass member for granular permission check
    record = await service.create_record(workspace_id, data, current_user, member=member)

    return {
        "success": True,
        "record": _record_to_response(record),
    }


@router.post("/{workspace_id}/records/bulk-import", response_model=dict, status_code=201)
async def bulk_import_records(
    workspace_id: str,
    records: list[RecordCreate],
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Bulk import records from JSON with import permission checks."""
    workspace, member = workspace_data

    from forecasto.dependencies import check_import_permission

    # Check import permission once (workspace-level)
    check_import_permission(member)

    # Validate area write permissions for all records
    for data in records:
        check_area_permission(member, data.area, "write")

    # Import all records
    service = RecordService(db)
    created_ids = []
    for data in records:
        record = await service.create_record(workspace_id, data, current_user, member=member)
        created_ids.append(record.id)

    # Re-fetch with eager-loaded relationships to avoid lazy-load MissingGreenlet
    await db.flush()
    from sqlalchemy import select as sa_select
    from forecasto.models.record import Record as RecordModel
    result = await db.execute(
        sa_select(RecordModel)
        .options(*service._audit_options)
        .where(RecordModel.id.in_(created_ids))
    )
    created = list(result.scalars().all())

    return {
        "success": True,
        "records": [_record_to_response(r) for r in created],
        "total": len(created)
    }


@router.post("/{workspace_id}/records/bulk-import-sdi", response_model=dict, status_code=201)
async def bulk_import_sdi_records(
    workspace_id: str,
    records: list[RecordCreate],
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Bulk import SDI invoices with SDI-specific permission checks."""
    workspace, member = workspace_data

    from forecasto.dependencies import check_import_sdi_permission

    # Check SDI import permission once (workspace-level)
    check_import_sdi_permission(member)

    # Validate area write permissions for all records
    for data in records:
        check_area_permission(member, data.area, "write")

    # Import all records
    service = RecordService(db)
    created_ids = []
    for data in records:
        record = await service.create_record(workspace_id, data, current_user, member=member)
        created_ids.append(record.id)

    # Re-fetch with eager-loaded relationships to avoid lazy-load MissingGreenlet
    await db.flush()
    from sqlalchemy import select as sa_select
    from forecasto.models.record import Record as RecordModel
    result = await db.execute(
        sa_select(RecordModel)
        .options(*service._audit_options)
        .where(RecordModel.id.in_(created_ids))
    )
    created = list(result.scalars().all())

    return {
        "success": True,
        "records": [_record_to_response(r) for r in created],
        "total": len(created)
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

    # Pass member for granular permission check
    record = await service.update_record(record, data, current_user, member=member)

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

    # Pass member for granular permission check
    await service.delete_record(record, current_user, member=member)

    return {"success": True, "message": "Record deleted"}


@router.post("/{workspace_id}/records/{record_id}/restore", response_model=dict)
async def restore_record(
    workspace_id: str,
    record_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Restore a soft-deleted record."""
    workspace, member = workspace_data

    service = RecordService(db)
    # Fetch including deleted records
    from forecasto.models.record import Record as RecordModel
    from sqlalchemy import select as sa_select
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        sa_select(RecordModel)
        .options(*service._audit_options)
        .where(RecordModel.id == record_id, RecordModel.workspace_id == workspace_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        from forecasto.exceptions import NotFoundException
        raise NotFoundException(f"Record {record_id} not found")

    check_area_permission(member, record.area, "write")
    record = await service.restore_record(record, current_user, member=member)

    return {"success": True, "record": _record_to_response(record)}


@router.get("/{workspace_id}/records/export", response_model=dict)
async def export_records(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    area: str | None = Query(None),
    date_start: date | None = Query(None),
    date_end: date | None = Query(None),
):
    """Export records with export permission checks."""
    workspace, member = workspace_data

    from forecasto.dependencies import check_export_permission

    # Check export permission once (workspace-level)
    check_export_permission(member)

    # Determine areas to export
    if area:
        areas_to_export = [area]
    else:
        # Export all readable areas
        areas_to_export = [
            a for a, perm in member.area_permissions.items() if perm != "none"
        ]

    # Fetch records
    service = RecordService(db)
    filters = RecordFilter(
        area=area,
        date_start=date_start,
        date_end=date_end,
    )

    records = await service.list_records(
        workspace_id, filters, member=member, current_user_id=current_user.id
    )

    # Filter by exportable areas
    exportable_records = [r for r in records if r.area in areas_to_export]

    return {
        "success": True,
        "records": [_record_to_response(r) for r in exportable_records],
        "total": len(exportable_records),
    }
