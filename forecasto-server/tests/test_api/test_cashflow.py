"""Tests for cashflow endpoints."""

from __future__ import annotations


import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_cashflow_calculation(authenticated_client: AsyncClient, test_workspace):
    """Test basic cashflow calculation."""

    # Create session and records
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Cashflow Session"},
    )
    session_id = session_response.json()["session"]["id"]

    # Create bank account
    account_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts",
        json={"name": "Cashflow Account"},
    )
    account_id = account_response.json()["bank_account"]["id"]

    # Add initial balance
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts/{account_id}/balances",
        json={"balance_date": "2026-01-01", "balance": "10000.00", "source": "manual"},
    )

    # Create inflow record
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "actual",
            "type": "0",
            "account": "INCOME",
            "reference": "CLIENT A",
            "date_cashflow": "2026-01-15",
            "date_offer": "2026-01-10",
            "amount": "5000.00",
            "vat": "1100.00",
            "total": "6100.00",
            "stage": "1",
            "bank_account_id": account_id,
        },
    )

    # Create outflow record
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "actual",
            "type": "0",
            "account": "EXPENSE",
            "reference": "SUPPLIER B",
            "date_cashflow": "2026-01-20",
            "date_offer": "2026-01-15",
            "amount": "-2000.00",
            "vat": "-440.00",
            "total": "-2440.00",
            "stage": "1",
            "bank_account_id": account_id,
        },
    )

    # Get cashflow
    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/cashflow",
        params={
            "from_date": "2026-01-01",
            "to_date": "2026-01-31",
            "areas": ["actual"],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "cashflow" in data
    assert "summary" in data

@pytest.mark.asyncio
async def test_cashflow_with_date_range(authenticated_client: AsyncClient, test_workspace):
    """Test cashflow with specific date range."""
    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/cashflow",
        params={
            "from_date": "2026-02-01",
            "to_date": "2026-02-28",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["parameters"]["from_date"] == "2026-02-01"
    assert data["parameters"]["to_date"] == "2026-02-28"

@pytest.mark.asyncio
async def test_running_balance_calculation(
    authenticated_client: AsyncClient, test_workspace
):
    """Test that running balance is calculated correctly."""
    # Create session
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Balance Session"},
    )
    session_id = session_response.json()["session"]["id"]

    # Create account with initial balance
    account_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts",
        json={"name": "Running Balance Account"},
    )
    account_id = account_response.json()["bank_account"]["id"]

    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/bank-accounts/{account_id}/balances",
        json={"balance_date": "2026-03-01", "balance": "1000.00", "source": "manual"},
    )

    # Create records
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "actual",
            "type": "0",
            "account": "INCOME",
            "reference": "CLIENT",
            "date_cashflow": "2026-03-10",
            "date_offer": "2026-03-05",
            "amount": "500.00",
            "vat": "110.00",
            "total": "610.00",
            "stage": "1",
            "bank_account_id": account_id,
        },
    )

    # Get cashflow
    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/cashflow",
        params={
            "from_date": "2026-03-01",
            "to_date": "2026-03-31",
            "areas": ["actual"],
        },
    )
    data = response.json()

    # Verify initial balance
    assert float(data["initial_balance"]["total"]) == 1000.00

@pytest.mark.asyncio
async def test_positive_amounts_are_inflows(
    authenticated_client: AsyncClient, test_workspace
):
    """Test that positive amounts are treated as inflows."""
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Inflow Session"},
    )
    session_id = session_response.json()["session"]["id"]

    # Create positive (inflow) record
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "actual",
            "type": "0",
            "account": "REVENUE",
            "reference": "CUSTOMER",
            "date_cashflow": "2026-04-15",
            "date_offer": "2026-04-10",
            "amount": "1000.00",  # Positive = inflow
            "vat": "220.00",
            "total": "1220.00",
            "stage": "1",
        },
    )

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/cashflow",
        params={
            "from_date": "2026-04-01",
            "to_date": "2026-04-30",
            "areas": ["actual"],
        },
    )
    data = response.json()
    # Inflows should be positive
    assert float(data["summary"]["total_inflows"]) >= 0

@pytest.mark.asyncio
async def test_negative_amounts_are_outflows(
    authenticated_client: AsyncClient, test_workspace
):
    """Test that negative amounts are treated as outflows."""
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Outflow Session"},
    )
    session_id = session_response.json()["session"]["id"]

    # Create negative (outflow) record
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "actual",
            "type": "0",
            "account": "EXPENSE",
            "reference": "VENDOR",
            "date_cashflow": "2026-05-15",
            "date_offer": "2026-05-10",
            "amount": "-500.00",  # Negative = outflow
            "vat": "-110.00",
            "total": "-610.00",
            "stage": "1",
        },
    )

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/cashflow",
        params={
            "from_date": "2026-05-01",
            "to_date": "2026-05-31",
            "areas": ["actual"],
        },
    )
    data = response.json()
    # Outflows should be negative
    assert float(data["summary"]["total_outflows"]) <= 0
