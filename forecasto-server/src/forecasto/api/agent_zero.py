"""Agente-zero API — dashboard highlights + manual run."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_workspace
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.services.agent_zero.service import AgentZeroService

router = APIRouter()


@router.get("/{workspace_id}/agent-zero/highlights", response_model=dict)
async def get_agent_zero_highlights(
    workspace_id: str,
    workspace_data: Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Aggregated insight items (next actions / reminders / criticalities)."""
    service = AgentZeroService(db)
    data = await service.get_highlights(workspace_id)
    return {"success": True, **data}


@router.post("/{workspace_id}/agent-zero/run", response_model=dict)
async def run_agent_zero(
    workspace_id: str,
    workspace_data: Annotated[tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Force an immediate analysis pass for this workspace (bypasses the delay)."""
    service = AgentZeroService(db)
    stats = await service.analyze_stale(workspace_id, bypass_delay=True, trigger="manual")
    data = await service.get_highlights(workspace_id)
    return {"success": True, "stats": stats, **data}
