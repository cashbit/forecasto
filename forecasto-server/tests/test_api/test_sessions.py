"""Tests for session endpoints."""

from __future__ import annotations


import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.models.session import Session

@pytest.mark.asyncio
async def test_create_session(authenticated_client: AsyncClient, test_workspace):
    """Test session creation."""

    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Test Session"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["session"]["title"] == "Test Session"
    assert data["session"]["status"] == "active"

@pytest.mark.asyncio
async def test_list_sessions(authenticated_client: AsyncClient, test_workspace):
    """Test listing sessions."""
    # Create a session first
    await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Session 1"},
    )

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/sessions"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["sessions"]) >= 1

@pytest.mark.asyncio
async def test_get_session(authenticated_client: AsyncClient, test_workspace):
    """Test getting session details."""
    # Create a session
    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Detail Session"},
    )
    session_id = create_response.json()["session"]["id"]

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/sessions/{session_id}"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["session"]["id"] == session_id

@pytest.mark.asyncio
async def test_add_message(authenticated_client: AsyncClient, test_workspace):
    """Test adding a message to session."""
    # Create a session
    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Message Session"},
    )
    session_id = create_response.json()["session"]["id"]

    # Add message
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions/{session_id}/messages",
        json={"content": "Test message content"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["user_message"]["content"] == "Test message content"

@pytest.mark.asyncio
async def test_get_messages(authenticated_client: AsyncClient, test_workspace):
    """Test getting session messages."""
    # Create a session
    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Messages Session"},
    )
    session_id = create_response.json()["session"]["id"]

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/sessions/{session_id}/messages"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Should have at least the system message from creation
    assert len(data["messages"]) >= 1

@pytest.mark.asyncio
async def test_get_operations(authenticated_client: AsyncClient, test_workspace):
    """Test getting session operations."""
    # Create a session
    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Operations Session"},
    )
    session_id = create_response.json()["session"]["id"]

    response = await authenticated_client.get(
        f"/api/v1/workspaces/{test_workspace.id}/sessions/{session_id}/operations"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert isinstance(data["operations"], list)

@pytest.mark.asyncio
async def test_discard_session(authenticated_client: AsyncClient, test_workspace):
    """Test discarding a session."""
    # Create a session
    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Discard Session"},
    )
    session_id = create_response.json()["session"]["id"]

    # Discard
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions/{session_id}/discard"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["session"]["status"] == "discarded"

@pytest.mark.asyncio
async def test_commit_session(authenticated_client: AsyncClient, test_workspace):
    """Test committing a session."""
    # Create a session
    create_response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions",
        json={"title": "Commit Session"},
    )
    session_id = create_response.json()["session"]["id"]

    # Commit
    response = await authenticated_client.post(
        f"/api/v1/workspaces/{test_workspace.id}/sessions/{session_id}/commit",
        json={"message": "Test commit"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["session"]["status"] == "committed"
