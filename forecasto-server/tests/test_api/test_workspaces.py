"""Tests for workspace endpoints."""

from __future__ import annotations


import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_workspace(authenticated_client: AsyncClient):
    """Test workspace creation."""

    response = await authenticated_client.post(
        "/api/v1/workspaces",
        json={
            "name": "New Workspace",
            "fiscal_year": 2026,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["workspace"]["name"] == "New Workspace"
    assert data["workspace"]["fiscal_year"] == 2026

@pytest.mark.asyncio
async def test_list_workspaces(authenticated_client: AsyncClient, test_workspace):
    """Test listing workspaces."""
    response = await authenticated_client.get("/api/v1/workspaces")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["workspaces"]) >= 1

@pytest.mark.asyncio
async def test_get_workspace(authenticated_client: AsyncClient, test_workspace):
    """Test getting workspace details."""
    response = await authenticated_client.get(f"/api/v1/workspaces/{test_workspace.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["workspace"]["id"] == test_workspace.id

@pytest.mark.asyncio
async def test_get_workspace_not_found(authenticated_client: AsyncClient):
    """Test getting nonexistent workspace."""
    response = await authenticated_client.get("/api/v1/workspaces/nonexistent-id")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_list_members(authenticated_client: AsyncClient, test_workspace, test_user):
    """Test listing workspace members."""
    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/members"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["members"]) == 1
    assert data["members"][0]["user"]["id"] == test_user.id

@pytest.mark.asyncio
async def test_invite_member(authenticated_client: AsyncClient, test_workspace):
    """Test inviting a member."""
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/invitations",
        json={
            "email": "newmember@example.com",
            "role": "member",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["invitation"]["email"] == "newmember@example.com"

@pytest.mark.asyncio
async def test_update_member_permissions(
    authenticated_client: AsyncClient, test_workspace, test_user
):
    """Test updating member permissions."""
    response = await authenticated_client.patch(
        f"/api/v1/workspaces/{test_workspace.id}/members/{test_user.id}",
        json={
            "area_permissions": {
                "actual": "read",
                "orders": "write",
                "prospect": "write",
                "budget": "none",
            },
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["member"]["area_permissions"]["actual"] == "read"
