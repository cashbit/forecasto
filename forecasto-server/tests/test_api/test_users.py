"""Tests for user endpoints."""

from __future__ import annotations


import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_register_new_user(client: AsyncClient):
    """Test user registration."""

    response = await client.post(
        "/api/v1/users/register",
        json={
            "email": "newuser@example.com",
            "password": "securepassword123",
            "name": "New User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["name"] == "New User"

@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, test_user):
    """Test registration with duplicate email."""
    response = await client.post(
        "/api/v1/users/register",
        json={
            "email": "test@example.com",
            "password": "password123",
            "name": "Another User",
        },
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "VALIDATION_ERROR"

@pytest.mark.asyncio
async def test_get_current_user(authenticated_client: AsyncClient, test_user):
    """Test getting current user profile."""
    response = await authenticated_client.get("/api/v1/users/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"

@pytest.mark.asyncio
async def test_get_current_user_unauthorized(client: AsyncClient):
    """Test getting user without authentication."""
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_update_profile(authenticated_client: AsyncClient, test_user):
    """Test updating user profile."""
    response = await authenticated_client.patch(
        "/api/v1/users/me",
        json={"name": "Updated Name"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
