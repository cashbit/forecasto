"""Tests for bank account endpoints."""

from __future__ import annotations


import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_bank_account(authenticated_client: AsyncClient, test_workspace):
    """Test bank account creation."""

    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts",
        json={
            "name": "Main Account",
            "iban": "IT60X0542811101000000123456",
            "bank_name": "Test Bank",
            "credit_limit": "50000.00",
            "is_default": True,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["bank_account"]["name"] == "Main Account"
    assert data["bank_account"]["is_default"] is True

@pytest.mark.asyncio
async def test_list_bank_accounts(authenticated_client: AsyncClient, test_workspace):
    """Test listing bank accounts."""
    # Create an account first
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts",
        json={"name": "List Account"},
    )

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["bank_accounts"]) >= 1

@pytest.mark.asyncio
async def test_add_balance(authenticated_client: AsyncClient, test_workspace):
    """Test adding a balance record."""
    # Create an account
    account_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts",
        json={"name": "Balance Account"},
    )
    account_id = account_response.json()["bank_account"]["id"]

    # Add balance
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts/{account_id}/balances",
        json={
            "balance_date": "2026-01-31",
            "balance": "100000.00",
            "source": "manual",
            "note": "Monthly statement",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert float(data["balance"]["balance"]) == 100000.00

@pytest.mark.asyncio
async def test_get_balance_history(authenticated_client: AsyncClient, test_workspace):
    """Test getting balance history."""
    # Create an account
    account_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts",
        json={"name": "History Account"},
    )
    account_id = account_response.json()["bank_account"]["id"]

    # Add multiple balances
    for i, (date, balance) in enumerate([
        ("2026-01-01", "90000.00"),
        ("2026-01-15", "95000.00"),
        ("2026-01-31", "100000.00"),
    ]):
        await authenticated_client.post(
            f"/api/v1/workspaces/{test_workspace.id}/bank-accounts/{account_id}/balances",
            json={"balance_date": date, "balance": balance, "source": "manual"},
        )

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts/{account_id}/balances"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["balances"]) == 3
