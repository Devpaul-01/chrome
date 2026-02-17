# contains methods for database engine and session creation, retrieval, and management

from __future__ import annotations

from typing import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncEngine,
    AsyncSession,
)

_engine: AsyncEngine | None = None
_Session: async_sessionmaker[AsyncSession] | None = None

# creates database engine based off of url
def init_engine(url: str) -> None:
    if not url:
        raise ValueError("Database URL cannot be empty")

    global _engine, _Session
    if _engine is not None:
        return

    engine = create_async_engine(url, future=True, pool_pre_ping=True)
    _engine = engine

    _Session = async_sessionmaker(
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        bind=engine,
        future=True
    )

# returns database engine
def get_engine() -> AsyncEngine:
    if _engine is None:
        raise RuntimeError("Database engine has not been initialised")
    return _engine

# returns session to interact with database
def get_session() -> AsyncSession:
    if _Session is None:
        raise RuntimeError("Session factory has not been initialised")
    return _Session()

@asynccontextmanager
async def async_session_scope() -> AsyncIterator[AsyncSession]:
    if _Session is None:
        raise RuntimeError("Session factory has not been initialised")

    session = _Session()
    try:
        async with session.begin():
            yield session
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


__all__ = ["get_engine", "init_engine", "async_session_scope"]