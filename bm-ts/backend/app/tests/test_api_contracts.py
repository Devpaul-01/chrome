"""
tests/test_api_contracts.py � API contract tests verifying status codes,
required fields, pagination, filtering, sorting, and response schemas
for every endpoint.
"""

from __future__ import annotations

import base64
from datetime import datetime, timezone, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MessageHistory, User


# ---------------------------------------------------------------------------
# 1. STATUS CODE CONTRACTS
# ---------------------------------------------------------------------------


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


@pytest.mark.asyncio
async def test_unauthenticated_multiple_endpoints() -> None:
    """All protected endpoints return 401/403 without auth."""
    from httpx import ASGITransport, AsyncClient as HC
    from app.main import app

    transport = ASGITransport(app=app)
    async with HC(transport=transport, base_url="http://test") as client:
        for path in [
            "/api/contacts/",
            "/api/posts",
            "/api/schedules",
            "/api/message-templates",
            "/api/images",
            "/api/messages/queue",
            "/api/messages/history",
            "/api/dashboard/stats",
            "/api/birthday-configs",
        ]:
            resp = await client.get(path)
            assert resp.status_code in (401, 403), f"{path} returned {resp.status_code}"


# ---- 404 for non-existent resources across all endpoints ----


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


@pytest.mark.asyncio
async def test_delete_nonexistent_post(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/posts/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_message_template(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/message-templates/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_image(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/images/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_birthday_config(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/birthday-configs/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_contact(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/contacts/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_post(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/posts/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_message_template(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/message-templates/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_image(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/images/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_birthday_config(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/birthday-configs/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_contact(async_client: AsyncClient) -> None:
    resp = await async_client.put(f"/api/contacts/{uuid4()}", json={"name": "X"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_post(async_client: AsyncClient) -> None:
    resp = await async_client.put(f"/api/posts/{uuid4()}", json={"content": "X"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_message_template(async_client: AsyncClient) -> None:
    resp = await async_client.put(
        f"/api/message-templates/{uuid4()}", json={"title": "X"}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_birthday_config(async_client: AsyncClient) -> None:
    resp = await async_client.put(
        f"/api/birthday-configs/{uuid4()}", json={"enabled": False}
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 2. REQUIRED FIELD VALIDATION (422 for missing fields)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_missing_email(async_client: AsyncClient) -> None:
    resp = await async_client.post("/auth/register", json={"password": "Pass123!"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_missing_password(async_client: AsyncClient) -> None:
    resp = await async_client.post("/auth/register", json={"email": "a@b.com"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_contact_missing_birthday(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/contacts/",
        json={
            "name": "Test",
            "facebook_profile_url": "https://facebook.com/test",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_contact_missing_name(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/contacts/",
        json={
            "facebook_profile_url": "https://facebook.com/test",
            "birthday": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_schedule_missing_days_before(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/schedules", json={"enabled": True})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_post_missing_content(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/posts", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_message_template_missing_greeting(
    async_client: AsyncClient,
) -> None:
    resp = await async_client.post(
        "/api/message-templates",
        json={
            "title": "Incomplete",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_message_template_missing_title(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/message-templates",
        json={
            "greeting": "Hi",
            "sentiment": "Body",
            "closing": "Bye",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_image_upload_missing_url(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/images/upload", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_image_upload_file_missing_data(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/images/upload-file",
        json={
            "filename": "test.png",
            "size": 100,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_image_upload_file_missing_filename(
    async_client: AsyncClient,
) -> None:
    pixel = base64.b64encode(b"\x89PNG" + b"\x00" * 50).decode()
    resp = await async_client.post(
        "/api/images/upload-file",
        json={
            "data": pixel,
            "size": len(base64.b64decode(pixel)),
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_smtp_config_missing_required_fields(async_client: AsyncClient) -> None:
    resp = await async_client.put("/smtp/config", json={"host": "smtp.test.com"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_birthday_config_missing_mode(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/birthday-configs", json={"days_offset": 0})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_queued_message_missing_friend_name(
    async_client: AsyncClient,
) -> None:
    resp = await async_client.post(
        "/api/messages/queue",
        json={
            "friend_profile_url": "https://facebook.com/x",
            "birthday_date": datetime.now(timezone.utc).isoformat(),
            "scheduled_send_time": datetime.now(timezone.utc).isoformat(),
            "message_content": "HBD",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_queued_message_missing_content(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/messages/queue",
        json={
            "friend_name": "Test",
            "friend_profile_url": "https://facebook.com/x",
            "birthday_date": datetime.now(timezone.utc).isoformat(),
            "scheduled_send_time": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 3. RESPONSE SCHEMA VALIDATION
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dashboard_stats_schema(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    required_keys = [
        "total_messages_sent",
        "messages_sent_today",
        "messages_sent_this_week",
        "messages_sent_this_month",
        "success_rate",
        "friends_with_upcoming_birthdays",
        "queued_messages",
    ]
    for key in required_keys:
        assert key in data, f"Missing key: {key}"
    assert isinstance(data["total_messages_sent"], int)
    assert isinstance(data["success_rate"], (int, float))


@pytest.mark.asyncio
async def test_contact_response_schema(async_client: AsyncClient) -> None:
    payload = {
        "name": "Schema Test",
        "facebook_profile_url": "https://facebook.com/schema",
        "birthday": datetime.now(timezone.utc).isoformat(),
        "gender": "MALE",
        "notes": "A note",
    }
    resp = await async_client.post("/api/contacts/", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    for key in [
        "id",
        "name",
        "facebook_profile_url",
        "birthday",
        "gender",
        "notes",
        "created_at",
    ]:
        assert key in data, f"Contact missing key: {key}"
    assert data["name"] == "Schema Test"
    assert data["gender"] == "MALE"


@pytest.mark.asyncio
async def test_post_response_schema(async_client: AsyncClient) -> None:
    payload = {
        "content": "Happy Birthday!",
        "gender": "ALL",
        "image_url": "https://example.com/img.png",
        "label": "Default",
        "font_family": "Arial",
        "font_size": 48,
        "font_color": "#000000",
    }
    resp = await async_client.post("/api/posts", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    for key in ["id", "content", "gender", "image_url", "label", "created_at"]:
        assert key in data, f"Post missing key: {key}"
    assert data["content"] == "Happy Birthday!"
    assert data["gender"] == "ALL"


@pytest.mark.asyncio
async def test_schedule_response_schema(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/schedules", json={"days_before": 7, "enabled": True}
    )
    assert resp.status_code == 201
    data = resp.json()
    for key in ["id", "user_id", "days_before", "enabled"]:
        assert key in data, f"Schedule missing key: {key}"
    assert isinstance(data["days_before"], int)
    assert isinstance(data["enabled"], bool)


@pytest.mark.asyncio
async def test_message_template_response_schema(async_client: AsyncClient) -> None:
    payload = {
        "title": "Schema Check",
        "greeting": "Hello",
        "sentiment": "Best wishes",
        "closing": "Bye",
    }
    resp = await async_client.post("/api/message-templates", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    for key in [
        "id",
        "title",
        "greeting",
        "sentiment",
        "closing",
        "gender",
        "days_in_advance",
        "created_at",
    ]:
        assert key in data, f"MessageTemplate missing key: {key}"
    assert isinstance(data["days_in_advance"], int)


@pytest.mark.asyncio
async def test_image_response_schema(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/images/upload",
        json={
            "url": "https://example.com/schema.jpg",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    for key in ["id", "url", "filename", "created_at"]:
        assert key in data, f"Image missing key: {key}"


@pytest.mark.asyncio
async def test_smtp_config_response_schema(async_client: AsyncClient) -> None:
    payload = {
        "host": "smtp.schema.com",
        "port": 587,
        "username": "user@schema.com",
        "password": "secret",
        "use_tls": True,
        "from_email": "user@schema.com",
        "from_name": "Bot",
    }
    resp = await async_client.put("/smtp/config", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    for key in ["host", "port", "username", "password", "use_tls", "from_email"]:
        assert key in data, f"SMTP missing key: {key}"
    assert data["password"] == "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"


@pytest.mark.asyncio
async def test_birthday_config_response_schema(async_client: AsyncClient) -> None:
    payload = {"mode": "ON_DAY", "days_offset": 0, "enabled": True}
    resp = await async_client.post("/api/birthday-configs", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    for key in [
        "id",
        "mode",
        "days_offset",
        "enabled",
        "archive_enabled",
        "gender_filter",
    ]:
        assert key in data, f"BirthdayConfig missing key: {key}"
    assert isinstance(data["enabled"], bool)


@pytest.mark.asyncio
async def test_queued_message_response_schema(async_client: AsyncClient) -> None:
    payload = {
        "friend_name": "Schema Friend",
        "friend_profile_url": "https://facebook.com/schemafriend",
        "birthday_date": datetime.now(timezone.utc).isoformat(),
        "scheduled_send_time": (
            datetime.now(timezone.utc) + timedelta(hours=1)
        ).isoformat(),
        "message_content": "HBD!",
    }
    resp = await async_client.post("/api/messages/queue", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    for key in [
        "id",
        "friend_name",
        "friend_profile_url",
        "birthday_date",
        "scheduled_send_time",
        "message_content",
        "status",
    ]:
        assert key in data, f"QueuedMessage missing key: {key}"
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_message_history_pagination(async_client: AsyncClient) -> None:
    resp = await async_client.get(
        "/api/messages/history", params={"page": 1, "page_size": 10}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert isinstance(data["items"], list)
    assert isinstance(data["total"], int)


@pytest.mark.asyncio
async def test_delete_response_schema(async_client: AsyncClient) -> None:
    """All delete endpoints should return {"status": "deleted"}."""
    create = await async_client.post(
        "/api/contacts/",
        json={
            "name": "Delete Schema",
            "facebook_profile_url": "https://facebook.com/ds",
            "birthday": datetime.now(timezone.utc).isoformat(),
        },
    )
    contact_id = create.json()["id"]

    resp = await async_client.delete(f"/api/contacts/{contact_id}")
    assert resp.status_code == 200
    assert resp.json() == {"status": "deleted"}


@pytest.mark.asyncio
async def test_delete_response_schema_all_resources(async_client: AsyncClient) -> None:
    """Verify {"status": "deleted"} across all deletable resources."""
    # Post
    post_resp = await async_client.post(
        "/api/posts",
        json={
            "content": "Del post",
            "gender": "ALL",
            "image_url": "https://x.com/i.png",
            "label": "L",
            "font_family": "Arial",
            "font_size": 48,
            "font_color": "#000",
        },
    )
    resp = await async_client.delete(f"/api/posts/{post_resp.json()['id']}")
    assert resp.json() == {"status": "deleted"}

    # Schedule
    sched_resp = await async_client.post("/api/schedules", json={"days_before": 1})
    resp = await async_client.delete(f"/api/schedules/{sched_resp.json()['id']}")
    assert resp.json() == {"status": "deleted"}

    # Message template
    tmpl_resp = await async_client.post(
        "/api/message-templates",
        json={
            "title": "D",
            "greeting": "H",
            "sentiment": "B",
            "closing": "C",
        },
    )
    resp = await async_client.delete(f"/api/message-templates/{tmpl_resp.json()['id']}")
    assert resp.json() == {"status": "deleted"}

    # Image
    img_resp = await async_client.post(
        "/api/images/upload",
        json={
            "url": "https://example.com/del.jpg",
        },
    )
    resp = await async_client.delete(f"/api/images/{img_resp.json()['id']}")
    assert resp.json() == {"status": "deleted"}

    # Birthday config
    cfg_resp = await async_client.post(
        "/api/birthday-configs",
        json={
            "mode": "ON_DAY",
            "days_offset": 0,
        },
    )
    resp = await async_client.delete(f"/api/birthday-configs/{cfg_resp.json()['id']}")
    assert resp.json() == {"status": "deleted"}


# ---------------------------------------------------------------------------
# 4. PAGINATION
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_pagination_multiple_pages(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """Message history pagination returns correct page metadata."""
    for i in range(7):
        db_session.add(
            MessageHistory(
                user_id=test_user.id,
                friend_name=f"F{i}",
                friend_profile_url=f"https://facebook.com/f{i}",
                birthday_date=datetime.now(timezone.utc),
                message_content="HBD",
                sent_at=datetime.now(timezone.utc) - timedelta(hours=i),
                status="sent",
            )
        )
    await db_session.commit()

    # Page 1
    resp = await async_client.get(
        "/api/messages/history", params={"page": 1, "page_size": 3}
    )
    data = resp.json()
    assert len(data["items"]) == 3
    assert data["total"] == 7
    assert data["page"] == 1
    assert data["page_size"] == 3

    # Page 2
    resp = await async_client.get(
        "/api/messages/history", params={"page": 2, "page_size": 3}
    )
    data = resp.json()
    assert len(data["items"]) == 3

    # Page 3 - partial
    resp = await async_client.get(
        "/api/messages/history", params={"page": 3, "page_size": 3}
    )
    data = resp.json()
    assert len(data["items"]) == 1

    # Page 4 - empty
    resp = await async_client.get(
        "/api/messages/history", params={"page": 4, "page_size": 3}
    )
    data = resp.json()
    assert len(data["items"]) == 0
    assert data["total"] == 7


# ---------------------------------------------------------------------------
# 5. FILTERING
# ---------------------------------------------------------------------------

_POST_BASE = {
    "image_url": "https://x.com/i.png",
    "label": "L",
    "font_family": "Arial",
    "font_size": 48,
    "font_color": "#000",
}


@pytest.mark.asyncio
async def test_posts_filter_by_gender(async_client: AsyncClient) -> None:
    """Posts list endpoint filters by gender query parameter."""
    await async_client.post(
        "/api/posts", json={**_POST_BASE, "content": "M", "gender": "MALE"}
    )
    await async_client.post(
        "/api/posts", json={**_POST_BASE, "content": "F", "gender": "FEMALE"}
    )

    resp = await async_client.get("/api/posts", params={"gender": "MALE"})
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["gender"] == "MALE"


@pytest.mark.asyncio
async def test_message_templates_filter_by_gender(async_client: AsyncClient) -> None:
    base = {"greeting": "Hi", "sentiment": "Best", "closing": "Bye"}
    await async_client.post(
        "/api/message-templates", json={**base, "title": "M", "gender": "MALE"}
    )
    await async_client.post(
        "/api/message-templates", json={**base, "title": "F", "gender": "FEMALE"}
    )

    resp = await async_client.get("/api/message-templates", params={"gender": "MALE"})
    items = resp.json()
    assert len(items) == 1
    assert items[0]["gender"] == "MALE"


@pytest.mark.asyncio
async def test_birthday_configs_filter_by_mode(async_client: AsyncClient) -> None:
    await async_client.post(
        "/api/birthday-configs", json={"mode": "ON_DAY", "days_offset": 0}
    )
    await async_client.post(
        "/api/birthday-configs", json={"mode": "EARLY", "days_offset": -1}
    )

    resp = await async_client.get("/api/birthday-configs", params={"mode": "EARLY"})
    items = resp.json()
    assert len(items) == 1
    assert items[0]["mode"] == "EARLY"


@pytest.mark.asyncio
async def test_birthday_configs_filter_by_enabled(async_client: AsyncClient) -> None:
    await async_client.post(
        "/api/birthday-configs",
        json={
            "mode": "ON_DAY",
            "days_offset": 0,
            "enabled": True,
        },
    )
    await async_client.post(
        "/api/birthday-configs",
        json={
            "mode": "BELATED",
            "days_offset": 1,
            "enabled": False,
        },
    )

    resp = await async_client.get("/api/birthday-configs", params={"enabled": "true"})
    items = resp.json()
    assert all(c["enabled"] for c in items)


@pytest.mark.asyncio
async def test_history_search_filter(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    for name in ["Alice Smith", "Bob Jones", "Alice Walker"]:
        db_session.add(
            MessageHistory(
                user_id=test_user.id,
                friend_name=name,
                friend_profile_url=f"https://facebook.com/{name.replace(' ', '')}",
                birthday_date=datetime.now(timezone.utc),
                message_content="HBD",
                sent_at=datetime.now(timezone.utc),
                status="sent",
            )
        )
    await db_session.commit()

    resp = await async_client.get("/api/messages/history", params={"search": "Alice"})
    data = resp.json()
    assert data["total"] == 2


@pytest.mark.asyncio
async def test_history_status_filter(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    for status in ["sent", "failed", "sent"]:
        db_session.add(
            MessageHistory(
                user_id=test_user.id,
                friend_name="F",
                friend_profile_url="https://facebook.com/f",
                birthday_date=datetime.now(timezone.utc),
                message_content="HBD",
                sent_at=datetime.now(timezone.utc),
                status=status,
            )
        )
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
    now = datetime.now(timezone.utc)
    for sent_at in [now - timedelta(days=30), now - timedelta(hours=1)]:
        db_session.add(
            MessageHistory(
                user_id=test_user.id,
                friend_name="F",
                friend_profile_url="https://facebook.com/f",
                birthday_date=now,
                message_content="HBD",
                sent_at=sent_at,
                status="sent",
            )
        )
    await db_session.commit()

    start = (now - timedelta(days=7)).isoformat()
    resp = await async_client.get("/api/messages/history", params={"start_date": start})
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_posts_no_filter_returns_all(async_client: AsyncClient) -> None:
    await async_client.post(
        "/api/posts", json={**_POST_BASE, "content": "A", "gender": "MALE"}
    )
    await async_client.post(
        "/api/posts", json={**_POST_BASE, "content": "B", "gender": "FEMALE"}
    )

    resp = await async_client.get("/api/posts")
    assert len(resp.json()) == 2


# ---------------------------------------------------------------------------
# 6. SORTING
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_contacts_sorted_by_name(async_client: AsyncClient) -> None:
    """Contacts list is sorted alphabetically by name."""
    for name in ["Charlie", "Alice", "Bob"]:
        await async_client.post(
            "/api/contacts/",
            json={
                "name": name,
                "facebook_profile_url": f"https://facebook.com/{name.lower()}",
                "birthday": datetime.now(timezone.utc).isoformat(),
            },
        )

    resp = await async_client.get("/api/contacts/")
    names = [c["name"] for c in resp.json()]
    assert names == sorted(names), f"Contacts not sorted by name: {names}"


@pytest.mark.asyncio
async def test_schedules_sorted_by_days_before(async_client: AsyncClient) -> None:
    """Schedules list is sorted ascending by days_before."""
    for d in [10, 1, 5]:
        await async_client.post("/api/schedules", json={"days_before": d})

    resp = await async_client.get("/api/schedules")
    days = [s["days_before"] for s in resp.json()]
    assert days == sorted(days), f"Schedules not sorted: {days}"


@pytest.mark.asyncio
async def test_message_history_sorted_by_sent_at_desc(
    async_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
) -> None:
    """Message history is sorted by sent_at descending (newest first)."""
    now = datetime.now(timezone.utc)
    for i in range(4):
        db_session.add(
            MessageHistory(
                user_id=test_user.id,
                friend_name=f"Friend{i}",
                friend_profile_url=f"https://facebook.com/f{i}",
                birthday_date=now,
                message_content="HBD",
                sent_at=now - timedelta(hours=i),
                status="sent",
            )
        )
    await db_session.commit()

    resp = await async_client.get("/api/messages/history")
    items = resp.json()["items"]
    sent_times = [item["sent_at"] for item in items]
    assert sent_times == sorted(sent_times, reverse=True), (
        f"History not sorted desc: {sent_times}"
    )


@pytest.mark.asyncio
async def test_message_queue_sorted_by_scheduled_time(
    async_client: AsyncClient,
) -> None:
    """Message queue is sorted by scheduled_send_time ascending."""
    now = datetime.now(timezone.utc)
    for i in [3, 1, 2]:
        await async_client.post(
            "/api/messages/queue",
            json={
                "friend_name": f"F{i}",
                "friend_profile_url": f"https://facebook.com/f{i}",
                "birthday_date": now.isoformat(),
                "scheduled_send_time": (now + timedelta(hours=i)).isoformat(),
                "message_content": "HBD",
            },
        )

    resp = await async_client.get("/api/messages/queue")
    items = resp.json()
    times = [item["scheduled_send_time"] for item in items]
    assert times == sorted(times), f"Queue not sorted by scheduled_send_time: {times}"


@pytest.mark.asyncio
async def test_posts_sorted_by_created_at_desc(async_client: AsyncClient) -> None:
    """Posts list is sorted by created_at descending (newest first)."""
    for label in ["First", "Second", "Third"]:
        await async_client.post(
            "/api/posts",
            json={
                **_POST_BASE,
                "content": label,
                "gender": "ALL",
            },
        )

    resp = await async_client.get("/api/posts")
    items = resp.json()
    created = [p["created_at"] for p in items]
    assert created == sorted(created, reverse=True), f"Posts not sorted desc: {created}"


@pytest.mark.asyncio
async def test_message_templates_sorted_by_created_at_desc(
    async_client: AsyncClient,
) -> None:
    """Message templates list is sorted by created_at descending."""
    base = {"greeting": "Hi", "sentiment": "Best", "closing": "Bye"}
    for title in ["First", "Second", "Third"]:
        await async_client.post("/api/message-templates", json={**base, "title": title})

    resp = await async_client.get("/api/message-templates")
    items = resp.json()
    created = [t["created_at"] for t in items]
    assert created == sorted(created, reverse=True), (
        f"Templates not sorted desc: {created}"
    )


@pytest.mark.asyncio
async def test_images_sorted_by_created_at_desc(async_client: AsyncClient) -> None:
    """Images list is sorted by created_at descending."""
    for i in range(3):
        await async_client.post(
            "/api/images/upload",
            json={
                "url": f"https://example.com/img{i}.jpg",
            },
        )

    resp = await async_client.get("/api/images")
    items = resp.json()
    created = [img["created_at"] for img in items]
    assert created == sorted(created, reverse=True), (
        f"Images not sorted desc: {created}"
    )


@pytest.mark.asyncio
async def test_birthday_configs_sorted_by_mode_and_offset(
    async_client: AsyncClient,
) -> None:
    """Birthday configs are sorted by mode ASC, then days_offset ASC."""
    await async_client.post(
        "/api/birthday-configs", json={"mode": "ON_DAY", "days_offset": 0}
    )
    await async_client.post(
        "/api/birthday-configs", json={"mode": "EARLY", "days_offset": -2}
    )
    await async_client.post(
        "/api/birthday-configs", json={"mode": "EARLY", "days_offset": -5}
    )
    await async_client.post(
        "/api/birthday-configs", json={"mode": "BELATED", "days_offset": 1}
    )

    resp = await async_client.get("/api/birthday-configs")
    items = resp.json()
    modes = [c["mode"] for c in items]
    assert modes == sorted(modes), f"Configs not sorted by mode: {modes}"

    # Within same mode, offsets should be ascending
    advance_offsets = [c["days_offset"] for c in items if c["mode"] == "EARLY"]
    assert advance_offsets == sorted(advance_offsets), (
        f"Advance offsets not sorted: {advance_offsets}"
    )
