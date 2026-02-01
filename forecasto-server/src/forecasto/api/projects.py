"""Project endpoints."""

from __future__ import annotations


from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_workspace
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.project import (
    PhaseCreate,
    PhaseResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from forecasto.services.project_service import ProjectService

router = APIRouter()

@router.get("/{workspace_id}/projects", response_model=dict)
async def list_projects(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = Query(None),
    customer_ref: str | None = Query(None),
):
    """List projects for a workspace."""

    service = ProjectService(db)
    projects = await service.list_projects(workspace_id, status, customer_ref)

    return {
        "success": True,
        "projects": [ProjectResponse.model_validate(p) for p in projects],
    }

@router.post("/{workspace_id}/projects", response_model=dict, status_code=201)
async def create_project(
    workspace_id: str,
    data: ProjectCreate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new project."""
    service = ProjectService(db)
    project = await service.create_project(workspace_id, data)
    await db.flush()

    # Reload with phases
    project = await service.get_project(project.id, workspace_id)

    return {"success": True, "project": ProjectResponse.model_validate(project)}

@router.get("/{workspace_id}/projects/{project_id}", response_model=dict)
async def get_project(
    workspace_id: str,
    project_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get project details."""
    service = ProjectService(db)
    project = await service.get_project(project_id, workspace_id)

    return {"success": True, "project": ProjectResponse.model_validate(project)}

@router.patch("/{workspace_id}/projects/{project_id}", response_model=dict)
async def update_project(
    workspace_id: str,
    project_id: str,
    data: ProjectUpdate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a project."""
    service = ProjectService(db)
    project = await service.get_project(project_id, workspace_id)
    project = await service.update_project(project, data)

    return {"success": True, "project": ProjectResponse.model_validate(project)}

@router.get("/{workspace_id}/projects/{project_id}/phases", response_model=dict)
async def list_phases(
    workspace_id: str,
    project_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List phases for a project."""
    service = ProjectService(db)
    phases = await service.get_phases(project_id)

    return {
        "success": True,
        "phases": [PhaseResponse.model_validate(p) for p in phases],
    }

@router.post(
    "/{workspace_id}/projects/{project_id}/phases",
    response_model=dict,
    status_code=201,
)
async def create_phase(
    workspace_id: str,
    project_id: str,
    data: PhaseCreate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new phase."""
    service = ProjectService(db)
    phase = await service.create_phase(project_id, data)

    return {"success": True, "phase": PhaseResponse.model_validate(phase)}
