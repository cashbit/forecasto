"""Pytest configuration and fixtures."""

from __future__ import annotations


import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from forecasto.database import get_db
from forecasto.main import app
from forecasto.models.base import Base
from forecasto.models.user import User
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.utils.security import create_access_token, hash_password

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def db_engine():
    """Create test database engine."""

    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(db_engine):
    """Create test database session."""
    async_session = async_sessionmaker(db_engine, expire_on_commit=False)
    async with async_session() as session:
        yield session

@pytest_asyncio.fixture
async def client(db_session):
    """Create test HTTP client."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession):
    """Create a test user."""
    user = User(
        email="test@example.com",
        password_hash=hash_password("testpassword123"),
        name="Test User",
        email_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user

@pytest_asyncio.fixture
async def test_workspace(db_session: AsyncSession, test_user: User):
    """Create a test workspace."""
    workspace = Workspace(
        name="Test Workspace",
        fiscal_year=2026,
        owner_id=test_user.id,
    )
    db_session.add(workspace)
    await db_session.commit()
    await db_session.refresh(workspace)

    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=test_user.id,
        role="owner",
        area_permissions={
            "actual": "write",
            "orders": "write",
            "prospect": "write",
            "budget": "write",
        },
    )
    db_session.add(member)
    await db_session.commit()

    return workspace

@pytest_asyncio.fixture
async def auth_headers(test_user: User):
    """Create authentication headers."""
    token = create_access_token({"sub": test_user.id, "email": test_user.email})
    return {"Authorization": f"Bearer {token}"}

@pytest_asyncio.fixture
async def authenticated_client(client: AsyncClient, auth_headers: dict):
    """Create authenticated test client."""
    client.headers.update(auth_headers)
    return client
