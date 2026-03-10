"""
db/session.py — Async SQLAlchemy engine and session factory.

One ``AsyncEngine`` is created at module-import time from ``settings.database_url``.
``pool_pre_ping=True`` ensures stale connections (e.g. after Postgres restart)
are silently recycled instead of raising errors mid-request.

Routes obtain a database session by declaring
``db: AsyncSession = Depends(get_db)`` in their signature — FastAPI calls
``get_db`` as an async generator and handles cleanup after the response.
"""

from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    future=True,
    max_overflow=0,  # Temporary value, change once we know our hardware requirements. Sample comment: Don't create more than pool_size connections.
    pool_size=10,  # Temporary value, change once we know our hardware requirements. Sample comment: Limit the number of connections in the pool.
    pool_recycle=3600,  # Temporary value, change once we know our hardware requirements. Sample comment: Recycle connections after 1 hour to prevent stale connections.
    pool_timeout=30,  # Temporary value, change once we know our hardware requirements. Sample comment: Wait up to 30 seconds for a connection before raising an error.
    pool_pre_ping=True  # Recycle stale connections transparently.
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Keep ORM objects usable after commit without re-fetching.
    autoflush=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session and guarantees it is closed afterwards."""
    async with AsyncSessionLocal() as session:
        yield session
