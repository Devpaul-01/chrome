"""
tests/test_api_contracts.py — API contract tests verifying status codes,
required fields, pagination, and response schemas.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient


# -------------------------------------------------------- Status code contracts
@pytest.mark.asyncio
async def test_health_returns_200(async_client: AsyncClient) -> None:
    resp = await async_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "database" in data


@pytest.mark.asyncio
async def test_unauthenticated_returns_401() -> None:
    """Endpoints should return 401 when no auth is provided."""
    from httpx import ASGITransport, AsyncClient as HC
    from app.main import app

    transport = ASGITransport(app=app)
    async with HC(transport=transport, base_url="http://test") as client:
        resp = await client.get("/auth/me")
        assert resp.status_code in (401, 403)


# -------------------------------------------------------- Required field tests
@pytest.mark.asyncio
async def test_register_missing_email(async_client: AsyncClient) -> None:
    resp = await async_client.post("/auth/register", json={"password": "Pass123!"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_contact_missing_birthday(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/contacts/", json={
        "name": "Test",
        "facebook_profile_url": "https://facebook.com/test",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_schedule_missing_days_before(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/schedules", json={"enabled": True})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_post_missing_content(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/posts", json={})
    assert resp.status_code == 422


# ----------------------------------------------------------- Delete contracts
@pytest.mark.asyncio
async def test_delete_nonexistent_contact(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/contacts/{uuid4()}")
    assert resp.status_code == 404
    assert "detail" in resp.json()


@pytest.mark.asyncio
async def test_delete_nonexistent_schedule(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/schedules/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_message_queue(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/messages/queue/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_message_history(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/messages/history/{uuid4()}")
    assert resp.status_code == 404


# ------------------------------------------------------- Response schema checks
@pytest.mark.asyncio
async def test_dashboard_stats_schema(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    required_keys = [
        "total_messages_sent", "messages_sent_today",
        "messages_sent_this_week", "messages_sent_this_month",
        "success_rate", "friends_with_upcoming_birthdays",
        "queued_messages",
    ]
    for key in required_keys:
        assert key in data, f"Missing key: {key}"


@pytest.mark.asyncio
async def test_contact_response_schema(async_client: AsyncClient) -> None:
    payload = {
        "name": "Schema Test",
        "facebook_profile_url": "https://facebook.com/schema",
        "birthday": datetime.now(timezone.utc).isoformat(),
    }
    resp = await async_client.post("/api/contacts/", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert "name" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_message_history_pagination(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/messages/history", params={"page": 1, "page_size": 10})
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data


@pytest.mark.asyncio
async def test_delete_response_schema(async_client: AsyncClient) -> None:
    """All delete endpoints should return {"status": "deleted"}."""
    create = await async_client.post("/api/contacts/", json={
        "name": "Delete Schema",
        "facebook_profile_url": "https://facebook.com/ds",
        "birthday": datetime.now(timezone.utc).isoformat(),
    })
    contact_id = create.json()["id"]

    resp = await async_client.delete(f"/api/contacts/{contact_id}")
    assert resp.status_code == 200
    assert resp.json() == {"status": "deleted"}
