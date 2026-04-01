"""Agent-specific endpoints — authenticated with X-Agent-Token (user-scoped)."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user
from forecasto.exceptions import ForbiddenException, NotFoundException, UnauthorizedException
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.services.inbox_service import InboxService

router = APIRouter()


async def _get_agent_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    x_agent_token: Annotated[str | None, Header()] = None,
):
    """Dependency: validate X-Agent-Token and return the User."""
    if not x_agent_token:
        raise UnauthorizedException("X-Agent-Token header required")
    service = InboxService(db)
    user = await service.get_user_from_agent_token(x_agent_token)
    if not user:
        raise ForbiddenException("Agent token non valido")
    return user


# ---------------------------------------------------------------------------
# Agent: list accessible workspaces
# ---------------------------------------------------------------------------

@router.get("/agent/workspaces", response_model=dict)
async def agent_list_workspaces(
    db: Annotated[AsyncSession, Depends(get_db)],
    user=Depends(_get_agent_user),
):
    """List all workspaces the authenticated user has access to (owned + member)."""
    # Workspaces owned by user
    owned = await db.execute(
        select(Workspace)
        .where(Workspace.owner_id == user.id)
        .where(Workspace.is_archived == False)
        .order_by(Workspace.name)
    )
    owned_ws = owned.scalars().all()

    # Workspaces where user is a member
    member_q = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .where(Workspace.is_archived == False)
        .order_by(Workspace.name)
    )
    member_ws = member_q.scalars().all()

    # Deduplicate
    seen: set[str] = set()
    workspaces = []
    for ws in list(owned_ws) + list(member_ws):
        if ws.id not in seen:
            seen.add(ws.id)
            workspaces.append({"id": ws.id, "name": ws.name, "description": ws.description})

    return {"success": True, "workspaces": workspaces}


# ---------------------------------------------------------------------------
# Agent: payment matching for reconciliation
# ---------------------------------------------------------------------------

@router.get("/agent/workspaces/{workspace_id}/payment-match", response_model=dict)
async def agent_payment_match(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user=Depends(_get_agent_user),
    amount: Decimal = Query(..., description="Payment amount"),
    reference: str = Query("", description="Reference text hint from document"),
):
    """Find records that could match a payment document (for reconciliation)."""
    service = InboxService(db)

    if not await service.verify_agent_workspace_access(user.id, workspace_id):
        raise ForbiddenException("Accesso al workspace non autorizzato")

    matches = await service.find_payment_matches(
        workspace_id=workspace_id,
        amount=amount,
        reference_hint=reference,
    )
    return {"success": True, "matches": matches}


@router.get("/workspaces/{workspace_id}/records/payment-match", response_model=dict)
async def workspace_payment_match(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    amount: float = Query(..., description="Payment amount (absolute value)"),
    reference: str = Query("", description="Reference text hint from the document"),
    x_agent_token: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
):
    """Find existing unpaid records matching a payment amount and reference hint.

    Accepts either X-Agent-Token (user-scoped) or X-Api-Key (workspace-scoped).
    """
    service = InboxService(db)

    if x_agent_token:
        user = await service.get_user_from_agent_token(x_agent_token)
        if not user:
            raise ForbiddenException("Agent token non valido")
        if not await service.verify_agent_workspace_access(user.id, workspace_id):
            raise ForbiddenException("Accesso al workspace non autorizzato")
    elif x_api_key:
        api_key_ws = await service.get_workspace_id_from_api_key(x_api_key)
        if api_key_ws != workspace_id:
            raise ForbiddenException("API key non autorizzata per questo workspace")
    else:
        raise UnauthorizedException("Autenticazione richiesta (X-Agent-Token o X-Api-Key)")

    matches = await service.find_payment_matches(
        workspace_id=workspace_id,
        amount=Decimal(str(amount)),
        reference_hint=reference,
    )
    return {"success": True, "matches": matches}


# ---------------------------------------------------------------------------
# User-facing: manage agent tokens (JWT auth via get_current_user)
# ---------------------------------------------------------------------------

@router.get("/agent/tokens", response_model=dict)
async def list_agent_tokens(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List active agent tokens for the current user."""
    service = InboxService(db)
    tokens = await service.list_agent_tokens(current_user.id)
    return {
        "success": True,
        "tokens": [
            {
                "id": t.id,
                "name": t.name,
                "created_at": t.created_at.isoformat(),
                "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
            }
            for t in tokens
        ],
    }


@router.post("/agent/tokens", response_model=dict, status_code=201)
async def create_agent_token(
    body: dict,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new agent token. Returns the raw token once — store it safely."""
    name = body.get("name", "Agent Token")
    service = InboxService(db)
    raw_token, token_obj = await service.create_agent_token(current_user.id, name)
    await db.commit()
    return {
        "success": True,
        "token": raw_token,  # shown only once
        "id": token_obj.id,
        "name": token_obj.name,
    }


@router.delete("/agent/tokens/{token_id}", response_model=dict)
async def revoke_agent_token(
    token_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Revoke an agent token by ID."""
    service = InboxService(db)
    ok = await service.revoke_agent_token(current_user.id, token_id)
    if not ok:
        raise NotFoundException("Token non trovato")
    await db.commit()
    return {"success": True}
