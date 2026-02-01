"""Tests for transfer endpoints."""

from __future__ import annotations


import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_transfer_record_between_areas(
    authenticated_client: AsyncClient, test_workspace
):
    """Test transferring a record between areas."""

    # Create session and record
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Transfer Session"},
    )
    session_id = session_response.json()["session"]["id"]

    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "prospect",
            "type": "0",
            "account": "TRANSFER TEST",
            "reference": "CLIENT",
            "date_cashflow": "2026-01-15",
            "date_offer": "2026-01-10",
            "amount": "5000.00",
            "vat": "1100.00",
            "total": "6100.00",
            "stage": "1",
        },
    )
    record_id = create_response.json()["record"]["id"]

    # Transfer from prospect to orders
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records/{record_id}/transfer",
        headers={"X-Session-Id": session_id},
        json={
            "to_area": "orders",
            "note": "Order confirmed",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["record"]["area"] == "orders"
    assert len(data["record"]["transfer_history"]) > 0

@pytest.mark.asyncio
async def test_transfer_history_updated(authenticated_client: AsyncClient, test_workspace):
    """Test that transfer history is properly updated."""
    # Create session and record
    session_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "History Session"},
    )
    session_id = session_response.json()["session"]["id"]

    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records",
        headers={"X-Session-Id": session_id},
        json={
            "area": "budget",
            "type": "0",
            "account": "HISTORY TEST",
            "reference": "CLIENT",
            "date_cashflow": "2026-02-15",
            "date_offer": "2026-02-10",
            "amount": "3000.00",
            "vat": "660.00",
            "total": "3660.00",
            "stage": "1",
        },
    )
    record_id = create_response.json()["record"]["id"]

    # Transfer to prospect
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records/{record_id}/transfer",
        headers={"X-Session-Id": session_id},
        json={"to_area": "prospect", "note": "Moving to prospect"},
    )

    # Transfer to orders
    transfer_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/records/{record_id}/transfer",
        headers={"X-Session-Id": session_id},
        json={"to_area": "orders", "note": "Order received"},
    )

    history = transfer_response.json()["record"]["transfer_history"]
    assert len(history) >= 2
    assert history[-1]["to_area"] == "orders"
