"""Tests for project endpoints."""

from __future__ import annotations


import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_project(authenticated_client: AsyncClient, test_workspace):
    """Test project creation."""

    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/projects",
        json={
            "name": "Test Project",
            "code": "PRJ-001",
            "customer_ref": "Client ABC",
            "expected_revenue": "50000.00",
            "expected_costs": "30000.00",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["project"]["name"] == "Test Project"

@pytest.mark.asyncio
async def test_create_project_with_phases(authenticated_client: AsyncClient, test_workspace):
    """Test project creation with phases."""
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/projects",
        json={
            "name": "Phased Project",
            "code": "PRJ-002",
            "phases": [
                {"name": "Analysis", "sequence": 1, "current_area": "prospect"},
                {"name": "Development", "sequence": 2, "current_area": "prospect"},
                {"name": "Deployment", "sequence": 3, "current_area": "prospect"},
            ],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data["project"]["phases"]) == 3

@pytest.mark.asyncio
async def test_list_projects(authenticated_client: AsyncClient, test_workspace):
    """Test listing projects."""
    # Create a project first
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/projects",
        json={"name": "List Project", "code": "PRJ-LIST"},
    )

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/projects"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["projects"]) >= 1

@pytest.mark.asyncio
async def test_get_project(authenticated_client: AsyncClient, test_workspace):
    """Test getting project details."""
    # Create a project
    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/projects",
        json={"name": "Detail Project", "code": "PRJ-DETAIL"},
    )
    project_id = create_response.json()["project"]["id"]

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/projects/{project_id}"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["project"]["id"] == project_id

@pytest.mark.asyncio
async def test_update_project(authenticated_client: AsyncClient, test_workspace):
    """Test updating a project."""
    # Create a project
    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/projects",
        json={"name": "Update Project", "code": "PRJ-UPDATE"},
    )
    project_id = create_response.json()["project"]["id"]

    # Update
    response = await authenticated_client.patch(
        f"/api/v1/workspaces/{test_workspace.id}/projects/{project_id}",
        json={"status": "active", "name": "Updated Name"},
    )
    assert response.status_code == 200
    assert response.json()["project"]["status"] == "active"
    assert response.json()["project"]["name"] == "Updated Name"
