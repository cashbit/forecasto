"""Usage tracking and billing endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.document_processing import UsageRecordResponse, UsageSummaryResponse, ModelUsageSummary
from forecasto.services.document_processing_service import DocumentProcessingService

router = APIRouter()


@router.get("/{workspace_id}/usage", response_model=dict)
async def get_usage_summary(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: str | None = Query(None, description="YYYY-MM-DD"),
    to_date: str | None = Query(None, description="YYYY-MM-DD"),
):
    """Get aggregated usage stats for a workspace + user monthly quota."""
    service = DocumentProcessingService(db)
    summary = await service.get_usage_summary(workspace_id, current_user.id, from_date, to_date)
    return {"success": True, **summary}


@router.get("/{workspace_id}/usage/records", response_model=dict)
async def list_usage_records(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List detailed usage records."""
    service = DocumentProcessingService(db)
    records, total = await service.list_usage_records(workspace_id, limit=limit, offset=offset)
    return {
        "success": True,
        "records": [UsageRecordResponse.model_validate(r) for r in records],
        "total": total,
    }
