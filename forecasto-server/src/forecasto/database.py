"""Database configuration and session management."""

from __future__ import annotations


from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from forecasto.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides a database session."""

    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

async def init_db() -> None:
    """Initialize database tables."""
    from forecasto.models.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
