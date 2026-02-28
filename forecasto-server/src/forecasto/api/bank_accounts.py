"""Bank account endpoints."""

from __future__ import annotations


from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
from forecasto.exceptions import ForbiddenException
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.bank_account import (
    BalanceCreate,
    BalanceResponse,
    BankAccountCreate,
    BankAccountResponse,
    BankAccountUpdate,
)
from forecasto.services.bank_account_service import BankAccountService

# User-level router (mounted at /api/v1/bank-accounts)
user_router = APIRouter()

# Workspace-level router (mounted at /api/v1/workspaces)
router = APIRouter()


# --- User-level endpoints: manage personal bank accounts ---

@user_router.get("", response_model=dict)
async def list_user_bank_accounts(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    active_only: bool = Query(True),
):
    """List bank accounts owned by the current user."""
    service = BankAccountService(db)
    accounts = await service.list_user_accounts(current_user.id, active_only)
    return {
        "success": True,
        "bank_accounts": [BankAccountResponse.model_validate(a) for a in accounts],
    }

@user_router.post("", response_model=dict, status_code=201)
async def create_bank_account(
    data: BankAccountCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new bank account for the current user."""
    service = BankAccountService(db)
    account = await service.create_account(current_user.id, data)
    await db.flush()
    await db.refresh(account)
    return {"success": True, "bank_account": BankAccountResponse.model_validate(account)}

@user_router.patch("/{account_id}", response_model=dict)
async def update_bank_account(
    account_id: str,
    data: BankAccountUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a bank account (only owner)."""
    service = BankAccountService(db)
    account = await service.get_account(account_id)
    if account.owner_id != current_user.id:
        raise ForbiddenException("You can only update your own bank accounts")
    account = await service.update_account(account, data)
    return {"success": True, "bank_account": BankAccountResponse.model_validate(account)}


# --- Workspace-level endpoints: manage bank account associations ---

def _require_workspace_owner(member: WorkspaceMember) -> None:
    """Ensure the member is the workspace owner."""
    if member.role != "owner":
        raise ForbiddenException("Only workspace owners can manage bank account associations")

@router.get("/{workspace_id}/bank-account", response_model=dict)
async def get_workspace_bank_account(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get the bank account associated with a workspace (owner only)."""
    _, member = workspace_data
    _require_workspace_owner(member)

    service = BankAccountService(db)
    account = await service.get_workspace_account(workspace_id)
    return {
        "success": True,
        "bank_account": BankAccountResponse.model_validate(account) if account else None,
    }

@router.put("/{workspace_id}/bank-account/{account_id}", response_model=dict)
async def set_workspace_bank_account(
    workspace_id: str,
    account_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Set the bank account for a workspace (owner only)."""
    _, member = workspace_data
    _require_workspace_owner(member)

    service = BankAccountService(db)
    # Verify user owns the bank account
    account = await service.get_account(account_id)
    if account.owner_id != current_user.id:
        raise ForbiddenException("You can only associate your own bank accounts")

    account = await service.set_workspace_account(workspace_id, account_id)
    return {
        "success": True,
        "bank_account": BankAccountResponse.model_validate(account),
    }

@router.delete("/{workspace_id}/bank-account", response_model=dict)
async def unset_workspace_bank_account(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Remove the bank account association from a workspace (owner only)."""
    _, member = workspace_data
    _require_workspace_owner(member)

    service = BankAccountService(db)
    await service.unset_workspace_account(workspace_id)
    return {"success": True}

# --- Balance endpoints (kept on workspace router for backward compat) ---

@router.get("/{workspace_id}/bank-accounts/{account_id}/balances", response_model=dict)
async def get_balances(
    workspace_id: str,
    account_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    """Get balance history for an account."""
    service = BankAccountService(db)
    balances = await service.get_balances(account_id, from_date, to_date)
    return {
        "success": True,
        "balances": [BalanceResponse.model_validate(b) for b in balances],
    }

@router.post(
    "/{workspace_id}/bank-accounts/{account_id}/balances",
    response_model=dict,
    status_code=201,
)
async def add_balance(
    workspace_id: str,
    account_id: str,
    data: BalanceCreate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Add or update a balance record."""
    service = BankAccountService(db)
    account = await service.get_account(account_id)
    balance = await service.add_balance(account, data, current_user)
    await db.flush()
    await db.refresh(balance)
    return {"success": True, "balance": BalanceResponse.model_validate(balance)}

@router.delete(
    "/{workspace_id}/bank-accounts/{account_id}/balances/{balance_id}",
    response_model=dict,
)
async def delete_balance(
    workspace_id: str,
    account_id: str,
    balance_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a balance snapshot."""
    _, member = workspace_data
    _require_workspace_owner(member)
    service = BankAccountService(db)
    await service.delete_balance(balance_id, account_id)
    return {"success": True}
