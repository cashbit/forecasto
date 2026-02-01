"""Session endpoints."""

from __future__ import annotations


from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.session import (
    CommitRequest,
    CommitResponse,
    DiscardResponse,
    MessageCreate,
    MessageResponse,
    OperationResponse,
    RedoResponse,
    ResolveConflictsRequest,
    SessionCreate,
    SessionResponse,
    SessionUser,
    UndoResponse,
)
from forecasto.services.session_service import SessionService

router = APIRouter()

@router.get("/{workspace_id}/sessions", response_model=dict)
async def list_sessions(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = Query(None),
    user_id: str | None = Query(None),
):
    """List sessions for a workspace."""

    service = SessionService(db)
    sessions = await service.list_sessions(workspace_id, status, user_id)

    session_responses = []
    for s in sessions:
        session_responses.append(
            SessionResponse(
                id=s.id,
                title=s.title,
                user=SessionUser(id=s.user_id, name=s.user.name if s.user else ""),
                status=s.status,
                created_at=s.created_at,
                last_activity=s.last_activity,
                committed_at=s.committed_at,
                discarded_at=s.discarded_at,
                commit_message=s.commit_message,
                changes_count=s.changes_count,
                changes_summary=s.changes_summary,
            )
        )

    return {"success": True, "sessions": session_responses}

@router.post("/{workspace_id}/sessions", response_model=dict, status_code=201)
async def create_session(
    workspace_id: str,
    data: SessionCreate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new work session."""
    service = SessionService(db)
    session = await service.create_session(workspace_id, current_user, data.title)

    return {
        "success": True,
        "session": SessionResponse(
            id=session.id,
            title=session.title,
            status=session.status,
            created_at=session.created_at,
            last_activity=session.last_activity,
            changes_count=session.changes_count,
            changes_summary=session.changes_summary,
        ),
    }

@router.get("/{workspace_id}/sessions/{session_id}", response_model=dict)
async def get_session(
    workspace_id: str,
    session_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get session details."""
    service = SessionService(db)
    session = await service.get_session(session_id)

    return {
        "success": True,
        "session": SessionResponse(
            id=session.id,
            title=session.title,
            user=SessionUser(id=session.user_id, name=session.user.name if session.user else ""),
            status=session.status,
            created_at=session.created_at,
            last_activity=session.last_activity,
            committed_at=session.committed_at,
            discarded_at=session.discarded_at,
            commit_message=session.commit_message,
            changes_count=session.changes_count,
            changes_summary=session.changes_summary,
        ),
    }

@router.get("/{workspace_id}/sessions/{session_id}/messages", response_model=dict)
async def get_messages(
    workspace_id: str,
    session_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get session messages."""
    service = SessionService(db)
    messages = await service.get_messages(session_id)
    return {
        "success": True,
        "messages": [MessageResponse.model_validate(m) for m in messages],
    }

@router.post("/{workspace_id}/sessions/{session_id}/messages", response_model=dict)
async def add_message(
    workspace_id: str,
    session_id: str,
    data: MessageCreate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Add a message to the session."""
    service = SessionService(db)
    session = await service.get_session(session_id)
    message = await service.add_message(session, data.content, "user")
    await db.flush()
    await db.refresh(message)

    return {
        "success": True,
        "user_message": MessageResponse.model_validate(message),
    }

@router.get("/{workspace_id}/sessions/{session_id}/operations", response_model=dict)
async def get_operations(
    workspace_id: str,
    session_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get session operations."""
    service = SessionService(db)
    operations = await service.get_operations(session_id)
    return {
        "success": True,
        "operations": [OperationResponse.model_validate(op) for op in operations],
    }

@router.post("/{workspace_id}/sessions/{session_id}/undo", response_model=UndoResponse)
async def undo_operation(
    workspace_id: str,
    session_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Undo the last operation."""
    service = SessionService(db)
    session = await service.get_session(session_id)
    return await service.undo_operation(session, current_user)

@router.post("/{workspace_id}/sessions/{session_id}/redo", response_model=RedoResponse)
async def redo_operation(
    workspace_id: str,
    session_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Redo the last undone operation."""
    service = SessionService(db)
    session = await service.get_session(session_id)
    return await service.redo_operation(session, current_user)

@router.post("/{workspace_id}/sessions/{session_id}/commit", response_model=CommitResponse)
async def commit_session(
    workspace_id: str,
    session_id: str,
    data: CommitRequest,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Commit session changes."""
    service = SessionService(db)
    session = await service.get_session(session_id)
    return await service.commit_session(session, current_user, data.message)

@router.post("/{workspace_id}/sessions/{session_id}/resolve-conflicts", response_model=CommitResponse)
async def resolve_conflicts(
    workspace_id: str,
    session_id: str,
    data: ResolveConflictsRequest,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Resolve conflicts and commit."""
    service = SessionService(db)
    session = await service.get_session(session_id)
    return await service.resolve_conflicts(
        session, current_user, data.resolutions, data.commit_message
    )

@router.post("/{workspace_id}/sessions/{session_id}/discard", response_model=DiscardResponse)
async def discard_session(
    workspace_id: str,
    session_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Discard session changes."""
    service = SessionService(db)
    session = await service.get_session(session_id)
    return await service.discard_session(session, current_user)
