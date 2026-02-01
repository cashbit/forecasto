"""Tests for record endpoints."""

from __future__ import annotations


from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_record_with_session(authenticated_client: AsyncClient, test_workspace):
    """Test creating a record with active session."""

    # Create a session
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Record Session"},
    )
    session_id = session_response.json()["session"]["id"]

    # Create record
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "orders",
            "type": "0",
            "account": "INCOME SOFTWARE",
            "reference": "ABC SRL",
            "date_cashflow": "2026-01-15",
            "date_offer": "2026-01-10",
            "amount": "1500.00",
            "vat": "330.00",
            "total": "1830.00",
            "stage": "1",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["record"]["account"] == "INCOME SOFTWARE"

@pytest.mark.asyncio
async def test_create_record_without_session_fails(
    authenticated_client: AsyncClient, test_workspace
):
    """Test that creating a record without session fails."""
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        json={
            "area": "orders",
            "type": "0",
            "account": "INCOME SOFTWARE",
            "reference": "ABC SRL",
            "date_cashflow": "2026-01-15",
            "date_offer": "2026-01-10",
            "amount": "1500.00",
            "vat": "330.00",
            "total": "1830.00",
            "stage": "1",
        },
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "SESSION_REQUIRED"

@pytest.mark.asyncio
async def test_list_records(authenticated_client: AsyncClient, test_workspace):
    """Test listing records."""
    # Create a session and record
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "List Records Session"},
    )
    session_id = session_response.json()["session"]["id"]

    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "orders",
            "type": "0",
            "account": "TEST ACCOUNT",
            "reference": "TEST REF",
            "date_cashflow": "2026-01-15",
            "date_offer": "2026-01-10",
            "amount": "1000.00",
            "vat": "220.00",
            "total": "1220.00",
            "stage": "1",
        },
    )

    # List records
    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        params={"area": "orders"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

@pytest.mark.asyncio
async def test_list_records_with_sign_filter(
    authenticated_client: AsyncClient, test_workspace
):
    """Test listing records with sign filter."""
    # Create session
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Sign Filter Session"},
    )
    session_id = session_response.json()["session"]["id"]

    # Create positive (inflow) record
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "orders",
            "type": "0",
            "account": "INCOME",
            "reference": "CLIENT",
            "date_cashflow": "2026-01-15",
            "date_offer": "2026-01-10",
            "amount": "1000.00",
            "vat": "220.00",
            "total": "1220.00",
            "stage": "1",
        },
    )

    # Create negative (outflow) record
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "orders",
            "type": "0",
            "account": "EXPENSE",
            "reference": "SUPPLIER",
            "date_cashflow": "2026-01-20",
            "date_offer": "2026-01-15",
            "amount": "-500.00",
            "vat": "-110.00",
            "total": "-610.00",
            "stage": "1",
        },
    )

    # Filter inflows
    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        params={"area": "orders", "sign": "in"},
    )
    data = response.json()
    for record in data["records"]:
        assert float(record["amount"]) > 0

    # Filter outflows
    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        params={"area": "orders", "sign": "out"},
    )
    data = response.json()
    for record in data["records"]:
        assert float(record["amount"]) < 0

@pytest.mark.asyncio
async def test_update_record(authenticated_client: AsyncClient, test_workspace):
    """Test updating a record."""
    # Create session and record
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Update Session"},
    )
    session_id = session_response.json()["session"]["id"]

    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "orders",
            "type": "0",
            "account": "ORIGINAL",
            "reference": "REF",
            "date_cashflow": "2026-01-15",
            "date_offer": "2026-01-10",
            "amount": "1000.00",
            "vat": "220.00",
            "total": "1220.00",
            "stage": "1",
        },
    )
    record_id = create_response.json()["record"]["id"]

    # Update
    response = await authenticated_client.patch(
        f"/api/v1/workspaces/{test_workspace.id}/records/{record_id}",
        headers={"X-Session-Id": session_id},
        json={"account": "UPDATED"},
    )
    assert response.status_code == 200
    assert response.json()["record"]["account"] == "UPDATED"

@pytest.mark.asyncio
async def test_delete_record_soft_delete(authenticated_client: AsyncClient, test_workspace):
    """Test soft deleting a record."""
    # Create session and record
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Delete Session"},
    )
    session_id = session_response.json()["session"]["id"]

    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "orders",
            "type": "0",
            "account": "TO DELETE",
            "reference": "REF",
            "date_cashflow": "2026-01-15",
            "date_offer": "2026-01-10",
            "amount": "1000.00",
            "vat": "220.00",
            "total": "1220.00",
            "stage": "1",
        },
    )
    record_id = create_response.json()["record"]["id"]

    # Delete
    response = await authenticated_client.delete(
        f"/api/v1/workspaces/{test_workspace.id}/records/{record_id}",
        headers={"X-Session-Id": session_id},
    )
    assert response.status_code == 200
    assert response.json()["success"] is True
