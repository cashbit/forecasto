"""Transfer endpoints."""

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
from forecasto.schemas.record import TransferRequest, TransferResponse
from forecasto.services.project_service import ProjectService
from forecasto.services.record_service import RecordService
from forecasto.services.transfer_service import TransferService

router = APIRouter()

@router.post("/{workspace_id}/records/{record_id}/transfer", response_model=TransferResponse)
async def transfer_record(
    workspace_id: str,
    record_id: str,
    data: TransferRequest,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(require_active_session)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Transfer a record to another area."""

    workspace, member = workspace_data

    record_service = RecordService(db)
    record = await record_service.get_record(record_id, workspace_id)

    # Check write permission on both source and destination areas
    check_area_permission(member, record.area, "write")
    check_area_permission(member, data.to_area, "write")

    transfer_service = TransferService(db)
    record = await transfer_service.transfer_record(
        record, data.to_area, current_user, session, data.note
    )

    # Build response
    project_info = None
    if record.project_id:
        project_info = {
            "project_id": record.project_id,
            "project_name": record.project.name if record.project else "",
            "project_code": record.project.code if record.project else None,
            "phase_id": record.phase_id,
            "phase_name": record.phase.name if record.phase else None,
            "phase_sequence": record.phase.sequence if record.phase else None,
        }

    from forecasto.schemas.record import RecordResponse

    record_response = RecordResponse(
        id=record.id,
        workspace_id=record.workspace_id,
        area=record.area,
        type=record.type,
        account=record.account,
        reference=record.reference,
        note=record.note,
        date_cashflow=record.date_cashflow,
        date_offer=record.date_offer,
        amount=record.amount,
        vat=record.vat,
        total=record.total,
        stage=record.stage,
        transaction_id=record.transaction_id,
        bank_account_id=record.bank_account_id,
        project=project_info,
        classification=record.classification,
        transfer_history=record.transfer_history,
        version=record.version,
        is_draft=False,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )

    return TransferResponse(
        record=record_response,
        operation={
            "id": record.id,
            "operation_type": "transfer",
            "from_area": record.transfer_history[-2]["from_area"]
            if len(record.transfer_history) > 1
            else record.transfer_history[-1]["from_area"],
            "to_area": data.to_area,
        },
    )

@router.post(
    "/{workspace_id}/projects/{project_id}/phases/{phase_id}/transfer",
    response_model=dict,
)
async def transfer_phase(
    workspace_id: str,
    project_id: str,
    phase_id: str,
    data: TransferRequest,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(require_active_session)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Transfer all records in a phase to another area."""
    workspace, member = workspace_data

    project_service = ProjectService(db)
    phase = await project_service.get_phase(phase_id, project_id)

    # Check write permission on source area
    check_area_permission(member, phase.current_area, "write")
    check_area_permission(member, data.to_area, "write")

    transferred = await project_service.transfer_phase(
        phase, data.to_area, current_user, session, data.note
    )

    return {
        "success": True,
        "transferred_count": len(transferred),
        "phase": {
            "id": phase.id,
            "name": phase.name,
            "current_area": phase.current_area,
        },
    }
