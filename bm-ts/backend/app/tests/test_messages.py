"""
tests/test_messages.py — Tests for the message queue and history router.

Covers: queue CRUD, retry flow, history listing with pagination, filtering,
status handling, and deletion.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MessageQueue, MessageHistory, User


def _queue_payload(**overrides) -> dict:
    """Build a valid message queue creation payload with sensible defaults."""
    base = {
        "friend_name": "Jane Doe",
        "friend_profile_url": "https://facebook.com/janedoe",
        "birthday_date": datetime.now(timezone.utc).isoformat(),
        "scheduled_send_time": (
            datetime.now(timezone.utc) + timedelta(hours=1)
        ).isoformat(),
        "message_content": "Happy Birthday Jane!",
    }
    base.update(overrides)
    return base


# ─── Queue CRUD ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_queue_empty(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/messages/queue")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_queued_message(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/messages/queue", json=_queue_payload())
    assert resp.status_code == 201
    data = resp.json()
    assert data["friend_name"] == "Jane Doe"
    assert data["status"] == "pending"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_queue_after_create(async_client: AsyncClient) -> None:
    await async_client.post("/api/messages/queue", json=_queue_payload())
    resp = await async_client.get("/api/messages/queue")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_update_queued_message_content(async_client: AsyncClient) -> None:
    create_resp = await async_client.post("/api/messages/queue", json=_queue_payload())
    msg_id = create_resp.json()["id"]

    resp = await async_client.put(
        f"/api/messages/queue/{msg_id}",
        json={"message_content": "Updated message!"},
    )
    assert resp.status_code == 200
    assert resp.json()["message_content"] == "Updated message!"


@pytest.mark.asyncio
async def test_update_queued_message_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.put(
        f"/api/messages/queue/{uuid4()}",
        json={"message_content": "Nope"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cancel_queued_message(async_client: AsyncClient) -> None:
    create_resp = await async_client.post("/api/messages/queue", json=_queue_payload())
    msg_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/messages/queue/{msg_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    # Verify it's gone
    list_resp = await async_client.get("/api/messages/queue")
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_cancel_message_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/messages/queue/{uuid4()}")
    assert resp.status_code == 404


# ─── Retry flow ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_retry_failed_message(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """A failed message can be retried, resetting its status to pending."""
    # Create message directly in DB with 'failed' status
    msg = MessageQueue(
        user_id=test_user.id,
        friend_name="Bob",
        friend_profile_url="https://facebook.com/bob",
        birthday_date=datetime.now(timezone.utc),
        scheduled_send_time=datetime.now(timezone.utc),
        message_content="Happy Bday Bob",
        status="failed",
        error_message="Network error",
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)

    resp = await async_client.post(f"/api/messages/queue/{msg.id}/retry")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert data["error_message"] is None


@pytest.mark.asyncio
async def test_retry_non_failed_message_rejected(async_client: AsyncClient) -> None:
    """Only failed messages can be retried; pending messages return 400."""
    create_resp = await async_client.post("/api/messages/queue", json=_queue_payload())
    msg_id = create_resp.json()["id"]

    resp = await async_client.post(f"/api/messages/queue/{msg_id}/retry")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_retry_message_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.post(f"/api/messages/queue/{uuid4()}/retry")
    assert resp.status_code == 404


# ─── Message History ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_history_empty(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/messages/history")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_history_pagination(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """History endpoint supports page/page_size pagination."""
    # Insert 5 history records
    for i in range(5):
        item = MessageHistory(
            user_id=test_user.id,
            friend_name=f"Friend {i}",
            friend_profile_url=f"https://facebook.com/friend{i}",
            birthday_date=datetime.now(timezone.utc),
            message_content=f"Happy Birthday Friend {i}!",
            sent_at=datetime.now(timezone.utc) - timedelta(hours=i),
            status="sent",
        )
        db_session.add(item)
    await db_session.commit()

    # Page 1 with size 2
    resp = await async_client.get(
        "/api/messages/history", params={"page": 1, "page_size": 2}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5
    assert data["page"] == 1
    assert data["page_size"] == 2

    # Page 3 with size 2 → 1 item
    resp = await async_client.get(
        "/api/messages/history", params={"page": 3, "page_size": 2}
    )
    data = resp.json()
    assert len(data["items"]) == 1


@pytest.mark.asyncio
async def test_history_search_filter(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """History supports search by friend_name."""
    for name in ["Alice Smith", "Bob Jones", "Alice Walker"]:
        item = MessageHistory(
            user_id=test_user.id,
            friend_name=name,
            friend_profile_url=f"https://facebook.com/{name.lower().replace(' ', '')}",
            birthday_date=datetime.now(timezone.utc),
            message_content=f"Happy Birthday {name}!",
            sent_at=datetime.now(timezone.utc),
            status="sent",
        )
        db_session.add(item)
    await db_session.commit()

    resp = await async_client.get("/api/messages/history", params={"search": "Alice"})
    data = resp.json()
    assert data["total"] == 2
    for item in data["items"]:
        assert "Alice" in item["friend_name"]


@pytest.mark.asyncio
async def test_history_status_filter(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """History supports filtering by status."""
    for i, status in enumerate(["sent", "failed", "sent"]):
        item = MessageHistory(
            user_id=test_user.id,
            friend_name=f"Friend {i}",
            friend_profile_url=f"https://facebook.com/f{i}",
            birthday_date=datetime.now(timezone.utc),
            message_content="HBD!",
            sent_at=datetime.now(timezone.utc),
            status=status,
        )
        db_session.add(item)
    await db_session.commit()

    resp = await async_client.get(
        "/api/messages/history", params={"status_filter": "failed"}
    )
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "failed"


@pytest.mark.asyncio
async def test_history_date_range_filter(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """History supports filtering by start_date and end_date."""
    now = datetime.now(timezone.utc)
    old = now - timedelta(days=30)
    recent = now - timedelta(hours=1)

    for sent_at in [old, recent]:
        item = MessageHistory(
            user_id=test_user.id,
            friend_name="Some Friend",
            friend_profile_url="https://facebook.com/sf",
            birthday_date=now,
            message_content="HBD!",
            sent_at=sent_at,
            status="sent",
        )
        db_session.add(item)
    await db_session.commit()

    # Filter to only recent (last 7 days)
    start = (now - timedelta(days=7)).isoformat()
    resp = await async_client.get("/api/messages/history", params={"start_date": start})
    data = resp.json()
    assert data["total"] == 1


@pytest.mark.asyncio
async def test_delete_history(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """Deleting a history item returns 200 and removes it."""
    item = MessageHistory(
        user_id=test_user.id,
        friend_name="Del Friend",
        friend_profile_url="https://facebook.com/delfriend",
        birthday_date=datetime.now(timezone.utc),
        message_content="Bye",
        sent_at=datetime.now(timezone.utc),
        status="sent",
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    resp = await async_client.delete(f"/api/messages/history/{item.id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


@pytest.mark.asyncio
async def test_delete_history_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/messages/history/{uuid4()}")
    assert resp.status_code == 404
