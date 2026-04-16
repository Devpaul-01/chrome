"""
tests/test_integration.py — Integration tests covering multi-step user flows.

These tests exercise the full request lifecycle through the API without
mocking the authenticated user (uses real JWT tokens from login).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.session import get_db
from app.main import app


@pytest_asyncio.fixture
async def real_client(db_session):
    """HTTP client with only the DB overridden — no user override."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


async def _register_and_verify(client: AsyncClient, db_session: AsyncSession, email: str, password: str) -> None:
    """Register a user and mark email as verified in the DB."""
    await client.post("/auth/register", json={"email": email, "password": password})
    # Mark email as verified so subsequent auth endpoints don't return 403
    await db_session.execute(
        update(User).where(User.email == email).values(email_verified=True)
    )
    await db_session.commit()


# ------------------------------------------------------------------ Auth flow
@pytest.mark.asyncio
async def test_full_auth_flow(real_client: AsyncClient, db_session: AsyncSession) -> None:
    """Register → verify email → login → refresh → change password → login with new password."""
    # Register and verify email
    await _register_and_verify(real_client, db_session, "authflow@example.com", "Original123!")

    # Login
    login = await real_client.post("/auth/login", json={
        "email": "authflow@example.com",
        "password": "Original123!",
    })
    assert login.status_code == 200
    tokens = login.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    access = tokens["access_token"]

    # Get profile
    me = await real_client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200
    assert me.json()["email"] == "authflow@example.com"

    # Refresh
    refresh = await real_client.post("/auth/refresh", json={
        "refresh_token": tokens["refresh_token"],
    })
    assert refresh.status_code == 200
    new_access = refresh.json()["access_token"]

    # Change password
    change = await real_client.post(
        "/auth/change-password",
        json={"current_password": "Original123!", "new_password": "Changed456!"},
        headers={"Authorization": f"Bearer {new_access}"},
    )
    assert change.status_code == 200

    # Login with new password
    login2 = await real_client.post("/auth/login", json={
        "email": "authflow@example.com",
        "password": "Changed456!",
    })
    assert login2.status_code == 200


# -------------------------------------------------------------- Template flow
@pytest.mark.asyncio
async def test_template_crud_flow(async_client: AsyncClient) -> None:
    """Create → list → update → soft-delete → verify gone from list."""
    # Create
    create = await async_client.post("/templates/", json={
        "segment_type": "GREETING",
        "content": "Happy Birthday!",
    })
    assert create.status_code == 201
    seg_id = create.json()["id"]

    # List — should have 1
    list_resp = await async_client.get("/templates/")
    assert len(list_resp.json()) == 1

    # Update
    update = await async_client.put(f"/templates/{seg_id}", json={
        "content": "Happy Birthday, friend!",
    })
    assert update.status_code == 200
    assert update.json()["content"] == "Happy Birthday, friend!"

    # Delete (soft-delete)
    delete = await async_client.delete(f"/templates/{seg_id}")
    assert delete.status_code == 200

    # List — should be empty (soft-deleted)
    list_resp2 = await async_client.get("/templates/")
    assert len(list_resp2.json()) == 0


# ------------------------------------------------- Message queue → history flow
@pytest.mark.asyncio
async def test_message_queue_to_history(async_client: AsyncClient) -> None:
    """Create a queued message → cancel it → verify queue is empty."""
    # Create a queued message
    create = await async_client.post("/api/messages/queue", json={
        "friend_name": "Jane",
        "friend_profile_url": "https://facebook.com/jane",
        "birthday_date": datetime.now(timezone.utc).isoformat(),
        "scheduled_send_time": datetime.now(timezone.utc).isoformat(),
        "message_content": "Happy Birthday Jane!",
    })
    assert create.status_code == 201
    msg_id = create.json()["id"]

    # List queue — should have 1
    queue = await async_client.get("/api/messages/queue")
    assert len(queue.json()) >= 1

    # Cancel it
    cancel = await async_client.delete(f"/api/messages/queue/{msg_id}")
    assert cancel.status_code == 200

    # Queue should be empty
    queue2 = await async_client.get("/api/messages/queue")
    assert len(queue2.json()) == 0


# --------------------------------------------------------- Schedule CRUD flow
@pytest.mark.asyncio
async def test_schedule_crud_flow(async_client: AsyncClient) -> None:
    """Create schedule → list → update → delete."""
    create = await async_client.post("/api/schedules", json={
        "days_before": 1,
        "enabled": True,
    })
    assert create.status_code == 201
    sched_id = create.json()["id"]

    # List
    list_resp = await async_client.get("/api/schedules")
    assert len(list_resp.json()) == 1

    # Update
    update = await async_client.put(f"/api/schedules/{sched_id}", json={
        "enabled": False,
    })
    assert update.status_code == 200
    assert update.json()["enabled"] is False

    # Delete
    delete = await async_client.delete(f"/api/schedules/{sched_id}")
    assert delete.status_code == 200

    list_resp2 = await async_client.get("/api/schedules")
    assert len(list_resp2.json()) == 0
