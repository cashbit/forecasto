"""Bank account endpoints."""

from __future__ import annotations


from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.database import get_db
from forecasto.dependencies import get_current_user, get_current_workspace
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

router = APIRouter()

@router.get("/{workspace_id}/bank-accounts", response_model=dict)
async def list_bank_accounts(
    workspace_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    active_only: bool = Query(True),
):
    """List bank accounts for a workspace."""

    service = BankAccountService(db)
    accounts = await service.list_accounts(workspace_id, active_only)

    return {
        "success": True,
        "bank_accounts": [BankAccountResponse.model_validate(a) for a in accounts],
    }

@router.post("/{workspace_id}/bank-accounts", response_model=dict, status_code=201)
async def create_bank_account(
    workspace_id: str,
    data: BankAccountCreate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new bank account."""
    service = BankAccountService(db)
    account = await service.create_account(workspace_id, data)
    await db.flush()
    await db.refresh(account)

    return {"success": True, "bank_account": BankAccountResponse.model_validate(account)}

@router.get("/{workspace_id}/bank-accounts/{account_id}", response_model=dict)
async def get_bank_account(
    workspace_id: str,
    account_id: str,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get bank account details."""
    service = BankAccountService(db)
    account = await service.get_account(account_id, workspace_id)

    return {"success": True, "bank_account": BankAccountResponse.model_validate(account)}

@router.patch("/{workspace_id}/bank-accounts/{account_id}", response_model=dict)
async def update_bank_account(
    workspace_id: str,
    account_id: str,
    data: BankAccountUpdate,
    workspace_data: Annotated[
        tuple[Workspace, WorkspaceMember], Depends(get_current_workspace)
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a bank account."""
    service = BankAccountService(db)
    account = await service.get_account(account_id, workspace_id)
    account = await service.update_account(account, data)

    return {"success": True, "bank_account": BankAccountResponse.model_validate(account)}

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
    account = await service.get_account(account_id, workspace_id)
    balance = await service.add_balance(account, data, current_user)
    await db.flush()
    await db.refresh(balance)

    return {"success": True, "balance": BalanceResponse.model_validate(balance)}

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
