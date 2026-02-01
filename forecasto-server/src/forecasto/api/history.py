"""History and version endpoints."""

from __future__ import annotations


from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import (
    check_area_permission,
    get_current_user,
    get_current_workspace,
    require_active_session,
)
from forecasto.models.session import Session
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.record import RecordHistoryResponse, RecordVersionResponse, RestoreRequest
from forecasto.services.record_service import RecordService

router = APIRouter()

@router.get("/{workspace_id}/records/{record_id}/history", response_model=RecordHistoryResponse)
async def get_record_history(
    workspace_id: str,
    record_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get version history for a record."""

    workspace, member = workspace_data

    service = RecordService(db)
    record = await service.get_record(record_id, workspace_id)

    check_area_permission(member, record.area, "read")

    versions = await service.get_history(record)

    # Build version responses with diff
    history = []
    prev_snapshot = None

    for v in versions:
        diff = None
        if prev_snapshot:
            diff = {}
            for key, value in v.snapshot.items():
                if prev_snapshot.get(key) != value:
                    diff[key] = {"old": prev_snapshot.get(key), "new": value}

        transfer_info = None
        if v.change_type == "transfer":
            # Extract from snapshot
            transfer_info = {
                "from_area": prev_snapshot.get("area") if prev_snapshot else None,
                "to_area": v.snapshot.get("area"),
            }

        # Get user info
        changed_by = None
        if v.user:
            changed_by = {"id": v.user.id, "name": v.user.name}

        history.append(
            RecordVersionResponse(
                version=v.version,
                change_type=v.change_type,
                changed_at=v.changed_at,
                changed_by=changed_by,
                snapshot=v.snapshot,
                diff=diff,
                transfer_info=transfer_info,
            )
        )

        prev_snapshot = v.snapshot

    return RecordHistoryResponse(
        record_id=record.id,
        current_version=record.version,
        history=history,
    )

@router.post("/{workspace_id}/records/{record_id}/restore", response_model=dict)
async def restore_record_version(
    workspace_id: str,
    record_id: str,
    data: RestoreRequest,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(require_active_session)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Restore a record to a previous version."""
    workspace, member = workspace_data

    service = RecordService(db)
    record = await service.get_record(record_id, workspace_id)

    check_area_permission(member, record.area, "write")

    record = await service.restore_version(
        record, data.version, current_user, session, data.note
    )

    return {"success": True, "message": f"Record restored to version {data.version}"}
