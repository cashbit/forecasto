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
)
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.record import TransferRequest, TransferResponse
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
        record, data.to_area, current_user, data.note
    )

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
        owner=record.owner,
        nextaction=record.nextaction,
        amount=record.amount,
        vat=record.vat,
        vat_deduction=record.vat_deduction,
        total=record.total,
        stage=record.stage,
        transaction_id=record.transaction_id,
        bank_account_id=record.bank_account_id,
        project_code=record.project_code,
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
