"""
conftest.py — Shared test fixtures for all backend tests.

Provides an ``async_client`` fixture that creates an ``httpx.AsyncClient``
bound to the FastAPI app with dependency overrides for the database session
and authenticated user.  No real database is required — all DB operations
are performed against an in-memory SQLite instance.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import StaticPool, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# --- SQLite compatibility for Postgres-specific types used in models ---
# Remap Postgres-only types to SQLAlchemy Text when running tests with SQLite
try:
    postgresql.CITEXT = sa.Text
    postgresql.ENUM = lambda *a, **k: sa.Text
except Exception:
    pass

from app.db.base import Base
from app.db.models import User
from app.core.security import hash_password

# Ensure created_at defaults are set for token rows when using SQLite tests
from app.db.models import EmailVerificationToken, PasswordResetToken

from sqlalchemy import event as sa_event


@sa_event.listens_for(EmailVerificationToken, "before_insert")
def _set_email_verif_created_at(mapper, connection, target):
    if getattr(target, "created_at", None) is None:
        target.created_at = datetime.now(timezone.utc)


@sa_event.listens_for(PasswordResetToken, "before_insert")
def _set_reset_created_at(mapper, connection, target):
    if getattr(target, "created_at", None) is None:
        target.created_at = datetime.now(timezone.utc)


from app.db.models import SubscriptionRecord


@sa_event.listens_for(SubscriptionRecord, "before_insert")
def _set_subscription_created_at(mapper, connection, target):
    now = datetime.now(timezone.utc)
    if getattr(target, "created_at", None) is None:
        target.created_at = now
    if getattr(target, "updated_at", None) is None:
        target.updated_at = now
    if getattr(target, "started_at", None) is None:
        target.started_at = now

# ---------------------------------------------------------------------------
# In-memory async SQLite engine (no real PostgreSQL needed for unit tests)
# ---------------------------------------------------------------------------
# NOTE: We use aiosqlite for async SQLite support.  The StaticPool ensures
# all connections share the same in-memory database so tables created in one
# coroutine are visible in another.
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create all tables before each test and drop them after."""
    async with engine.begin() as conn:
        # SQLite can't parse Postgres-specific server_default SQL (eg: "'{}'::json", "now()").
        # When testing with SQLite, strip server_default expressions so create_all succeeds.
        if engine.url.get_backend_name() == "sqlite":
            for table in Base.metadata.tables.values():
                for col in table.columns:
                    if getattr(col, "server_default", None) is not None:
                        col.server_default = None

        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a fresh async session for direct DB manipulation in tests."""
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create and return a standard test user."""
    user = User(
        id=uuid.uuid4(),
        email="testuser@example.com",
        password_hash=hash_password("TestPass123!"),
        last_login_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        failed_login_count=0,
        locked_until=None,
        email_verified=False,
        metadata_payload={},
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession, test_user: User) -> AsyncGenerator[AsyncClient, None]:
    """
    HTTP client bound to the FastAPI app with overridden dependencies.

    - ``get_db`` → yields the test ``db_session``
    - ``get_current_user`` → returns the ``test_user`` (no real JWT needed)
    """
    from app.main import app
    from app.db.session import get_db
    from app.api.deps import get_current_user

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        return test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()
