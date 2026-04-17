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


from app.db.models import SubscriptionRecord  # noqa: E402


@sa_event.listens_for(SubscriptionRecord, "before_insert")
def _set_subscription_created_at(mapper, connection, target):
    now = datetime.now(timezone.utc)
    if getattr(target, "created_at", None) is None:
        target.created_at = now
    if getattr(target, "updated_at", None) is None:
        target.updated_at = now
    if getattr(target, "started_at", None) is None:
        target.started_at = now


# Phase 2 models — set created_at/updated_at defaults for SQLite tests
from app.db.models import (  # noqa: E402
    BirthdayConfig,
    Contact,
    MessageGroup,
    MessageTemplate,
    Post,
    UserImage,
    SMTPConfig,
    MessageQueue,
    MessageHistory,
    BirthdaySchedule,
    TemplateSegment,
    UserSession,
    RevokedToken,
)

_MODELS_WITH_TIMESTAMPS = [
    BirthdayConfig,
    Contact,
    MessageGroup,
    MessageTemplate,
    Post,
    SMTPConfig,
    MessageQueue,
    MessageHistory,
    BirthdaySchedule,
    TemplateSegment,
]

for _Model in _MODELS_WITH_TIMESTAMPS:

    @sa_event.listens_for(_Model, "before_insert")
    def _set_timestamps(mapper, connection, target):
        now = datetime.now(timezone.utc)
        if getattr(target, "created_at", None) is None:
            target.created_at = now
        if (
            hasattr(target, "updated_at")
            and getattr(target, "updated_at", None) is None
        ):
            target.updated_at = now


# User model needs timestamp defaults + server_default-backed boolean/int columns
@sa_event.listens_for(User, "before_insert")
def _set_user_defaults(mapper, connection, target):
    now = datetime.now(timezone.utc)
    if getattr(target, "created_at", None) is None:
        target.created_at = now
    if getattr(target, "updated_at", None) is None:
        target.updated_at = now
    if getattr(target, "failed_login_count", None) is None:
        target.failed_login_count = 0
    if getattr(target, "email_verified", None) is None:
        target.email_verified = False
    if getattr(target, "metadata_payload", None) is None:
        target.metadata_payload = {}


# Post model has is_default with nullable=False and server_default stripped
@sa_event.listens_for(Post, "before_insert")
def _set_post_defaults(mapper, connection, target):
    if getattr(target, "is_default", None) is None:
        target.is_default = False


@sa_event.listens_for(UserImage, "before_insert")
def _set_user_image_created_at(mapper, connection, target):
    if getattr(target, "created_at", None) is None:
        target.created_at = datetime.now(timezone.utc)


@sa_event.listens_for(UserSession, "before_insert")
def _set_session_created_at(mapper, connection, target):
    now = datetime.now(timezone.utc)
    if getattr(target, "created_at", None) is None:
        target.created_at = now
    if getattr(target, "last_seen_at", None) is None:
        target.last_seen_at = now


@sa_event.listens_for(RevokedToken, "before_insert")
def _set_revoked_at(mapper, connection, target):
    if getattr(target, "revoked_at", None) is None:
        target.revoked_at = datetime.now(timezone.utc)


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


# Enable FK constraint enforcement for SQLite on every connection
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()


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
async def async_client(
    db_session: AsyncSession, test_user: User
) -> AsyncGenerator[AsyncClient, None]:
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
