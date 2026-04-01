"""Inbox endpoints — document queue from Forecasto Agent."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.exceptions import ForbiddenException, UnauthorizedException
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.inbox import (
    InboxCountResponse,
    InboxItemCreate,
    InboxItemResponse,
    InboxItemUpdate,
)
from forecasto.services.event_bus import event_bus
from forecasto.services.inbox_service import InboxService

router = APIRouter()


async def _get_inbox_service(db: Annotated[AsyncSession, Depends(get_db)]) -> InboxService:
    return InboxService(db)


# ---------------------------------------------------------------------------
# Agent endpoint: POST /workspaces/{workspace_id}/inbox
# Auth: X-API-Key header
# ---------------------------------------------------------------------------

@router.post("/{workspace_id}/inbox", response_model=dict, status_code=201)
async def agent_create_inbox_item(
    workspace_id: str,
    data: InboxItemCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_api_key: Annotated[str | None, Header()] = None,
    x_agent_token: Annotated[str | None, Header()] = None,
):
    """Create an inbox item from the Forecasto Agent (API key or agent token auth)."""
    service = InboxService(db)

    if x_agent_token:
        user = await service.get_user_from_agent_token(x_agent_token)
        if not user:
            raise ForbiddenException("Agent token non valido")
        if not await service.verify_agent_workspace_access(user.id, workspace_id):
            raise ForbiddenException("Accesso al workspace non autorizzato")
    elif x_api_key:
        api_key_workspace_id = await service.get_workspace_id_from_api_key(x_api_key)
        if api_key_workspace_id != workspace_id:
            raise ForbiddenException("API key non autorizzata per questo workspace")
    else:
        raise UnauthorizedException("Autenticazione richiesta: X-Agent-Token o X-API-Key")

    item = await service.create_item(workspace_id=workspace_id, data=data)
    await db.commit()

    await event_bus.publish(
        "inbox_changed",
        workspace_id=workspace_id,
        data={"action": "create", "item_id": item.id},
    )

    return {"success": True, "item": InboxItemResponse.model_validate(item)}


@router.post("/{workspace_id}/inbox/source-deleted", response_model=dict)
async def agent_mark_source_deleted(
    workspace_id: str,
    source_hash: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_api_key: Annotated[str | None, Header()] = None,
    x_agent_token: Annotated[str | None, Header()] = None,
):
    """Notify server that the source file was deleted (API key or agent token auth)."""
    service = InboxService(db)

    if x_agent_token:
        user = await service.get_user_from_agent_token(x_agent_token)
        if not user:
            raise ForbiddenException("Agent token non valido")
        if not await service.verify_agent_workspace_access(user.id, workspace_id):
            raise ForbiddenException("Accesso al workspace non autorizzato")
    elif x_api_key:
        api_key_workspace_id = await service.get_workspace_id_from_api_key(x_api_key)
        if api_key_workspace_id != workspace_id:
            raise ForbiddenException("API key non autorizzata per questo workspace")
    else:
        raise UnauthorizedException("Autenticazione richiesta: X-Agent-Token o X-API-Key")

    items = await service.mark_source_deleted(workspace_id=workspace_id, source_hash=source_hash)
    await db.commit()

    if items:
        await event_bus.publish(
            "inbox_changed",
            workspace_id=workspace_id,
            data={"action": "source_deleted"},
        )

    return {"success": True, "updated": len(items)}


# ---------------------------------------------------------------------------
# User endpoints (JWT auth)
# ---------------------------------------------------------------------------

@router.get("/{workspace_id}/inbox/count", response_model=InboxCountResponse)
async def get_inbox_count(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get count of pending inbox items (for sidebar badge)."""
    service = InboxService(db)
    count = await service.count_pending(workspace_id)
    return InboxCountResponse(pending=count)


@router.get("/{workspace_id}/inbox", response_model=dict)
async def list_inbox_items(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = Query(None, description="Filter by status: pending, confirmed, rejected"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List inbox items for a workspace."""
    service = InboxService(db)
    items, total = await service.list_items(
        workspace_id=workspace_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    return {
        "success": True,
        "items": [InboxItemResponse.model_validate(i) for i in items],
        "total": total,
    }


@router.get("/{workspace_id}/inbox/{item_id}", response_model=dict)
async def get_inbox_item(
    workspace_id: str,
    item_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single inbox item."""
    service = InboxService(db)
    item = await service.get_item(workspace_id=workspace_id, item_id=item_id)
    return {"success": True, "item": InboxItemResponse.model_validate(item)}


@router.patch("/{workspace_id}/inbox/{item_id}", response_model=dict)
async def update_inbox_item(
    workspace_id: str,
    item_id: str,
    data: InboxItemUpdate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update extracted_data of a pending inbox item (user edits before confirm)."""
    service = InboxService(db)
    item = await service.update_item(
        workspace_id=workspace_id, item_id=item_id, data=data
    )
    await db.commit()
    return {"success": True, "item": InboxItemResponse.model_validate(item)}


@router.post("/{workspace_id}/inbox/{item_id}/confirm", response_model=dict)
async def confirm_inbox_item(
    workspace_id: str,
    item_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Confirm an inbox item: creates Forecasto records from extracted_data."""
    _, member = workspace_data
    service = InboxService(db)
    item = await service.confirm_item(
        workspace_id=workspace_id,
        item_id=item_id,
        user=current_user,
        member=member,
    )
    await db.commit()

    await event_bus.publish(
        "inbox_changed",
        workspace_id=workspace_id,
        data={"action": "confirmed", "item_id": item.id},
    )
    await event_bus.publish(
        "records_changed",
        workspace_id=workspace_id,
        data={"action": "bulk_create"},
    )

    return {"success": True, "item": InboxItemResponse.model_validate(item)}


@router.post("/{workspace_id}/inbox/{item_id}/reject", response_model=dict)
async def reject_inbox_item(
    workspace_id: str,
    item_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Reject an inbox item."""
    service = InboxService(db)
    item = await service.reject_item(workspace_id=workspace_id, item_id=item_id)
    await db.commit()

    await event_bus.publish(
        "inbox_changed",
        workspace_id=workspace_id,
        data={"action": "rejected", "item_id": item.id},
    )

    return {"success": True, "item": InboxItemResponse.model_validate(item)}


@router.delete("/{workspace_id}/inbox/{item_id}", response_model=dict)
async def delete_inbox_item(
    workspace_id: str,
    item_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Soft-delete an inbox item."""
    service = InboxService(db)
    await service.delete_item(workspace_id=workspace_id, item_id=item_id)
    await db.commit()
    return {"success": True}
