"""Regression coverage for transparent legacy bcrypt -> Argon2 migration."""

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.security import hash_password, pwd_context
from app.db.models import User
from app.db.session import get_db
from app.main import app


@pytest_asyncio.fixture
async def auth_client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def _legacy_user(db_session, email: str, password: str, *, verified: bool = True) -> User:
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        password_hash=pwd_context.hash(password, scheme="bcrypt"),
        created_at=now,
        updated_at=now,
        last_login_at=now,
        failed_login_count=0,
        locked_until=None,
        email_verified=verified,
        metadata_payload={},
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_valid_legacy_bcrypt_login_upgrades_to_argon2(auth_client, db_session):
    user = await _legacy_user(db_session, "legacy-upgrade@example.com", "LegacyPass123!")
    original = user.password_hash
    assert original.startswith("$2")

    response = await auth_client.post(
        "/auth/login",
        json={"email": user.email, "password": "LegacyPass123!"},
    )
    assert response.status_code == 200

    await db_session.refresh(user)
    assert user.password_hash.startswith("$argon2")
    assert user.password_hash != original
    assert pwd_context.verify("LegacyPass123!", user.password_hash)


@pytest.mark.asyncio
async def test_wrong_legacy_password_does_not_upgrade_hash(auth_client, db_session):
    user = await _legacy_user(db_session, "legacy-wrong@example.com", "LegacyPass123!")
    original = user.password_hash

    response = await auth_client.post(
        "/auth/login",
        json={"email": user.email, "password": "WrongPass123!"},
    )
    assert response.status_code == 401

    await db_session.refresh(user)
    assert user.password_hash == original
    assert user.failed_login_count == 1


@pytest.mark.asyncio
async def test_argon2_login_does_not_rehash_current_hash(auth_client, db_session):
    now = datetime.now(timezone.utc)
    original = hash_password("CurrentPass123!")
    user = User(
        email="argon2-current@example.com",
        password_hash=original,
        created_at=now,
        updated_at=now,
        last_login_at=now,
        failed_login_count=0,
        locked_until=None,
        email_verified=True,
        metadata_payload={},
    )
    db_session.add(user)
    await db_session.commit()

    response = await auth_client.post(
        "/auth/login",
        json={"email": user.email, "password": "CurrentPass123!"},
    )
    assert response.status_code == 200

    await db_session.refresh(user)
    assert user.password_hash == original


@pytest.mark.asyncio
async def test_unverified_legacy_account_is_not_rehashed(auth_client, db_session):
    user = await _legacy_user(
        db_session,
        "legacy-unverified@example.com",
        "LegacyPass123!",
        verified=False,
    )
    original = user.password_hash

    response = await auth_client.post(
        "/auth/login",
        json={"email": user.email, "password": "LegacyPass123!"},
    )
    assert response.status_code == 403

    await db_session.refresh(user)
    assert user.password_hash == original