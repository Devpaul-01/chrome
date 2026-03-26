"""
tests/test_message_templates.py — Tests for the message templates CRUD router.

Covers: create, list, get, update, delete, gender filtering, validation.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_message_templates_empty(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/message-templates")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_message_template(async_client: AsyncClient) -> None:
    payload = {
        "title": "Warm Wishes",
        "greeting": "Happy Birthday!",
        "sentiment": "Wishing you all the best on your special day.",
        "closing": "Cheers!",
    }
    resp = await async_client.post("/api/message-templates", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Warm Wishes"
    assert data["greeting"] == "Happy Birthday!"
    assert data["gender"] == "ALL"
    assert data["days_in_advance"] == 0
    assert "id" in data


@pytest.mark.asyncio
async def test_create_message_template_with_options(async_client: AsyncClient) -> None:
    payload = {
        "title": "Early Greeting",
        "greeting": "Hi there!",
        "sentiment": "Your birthday is coming up soon!",
        "closing": "See you then!",
        "gender": "FEMALE",
        "days_in_advance": 3,
        "image_url": "https://example.com/cake.png",
    }
    resp = await async_client.post("/api/message-templates", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["gender"] == "FEMALE"
    assert data["days_in_advance"] == 3
    assert data["image_url"] == "https://example.com/cake.png"


@pytest.mark.asyncio
async def test_get_message_template(async_client: AsyncClient) -> None:
    payload = {
        "title": "Get Test",
        "greeting": "Hi",
        "sentiment": "Have a great day",
        "closing": "Bye",
    }
    create_resp = await async_client.post("/api/message-templates", json=payload)
    template_id = create_resp.json()["id"]

    resp = await async_client.get(f"/api/message-templates/{template_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == template_id


@pytest.mark.asyncio
async def test_get_message_template_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/message-templates/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_message_template(async_client: AsyncClient) -> None:
    payload = {
        "title": "Original",
        "greeting": "Hi",
        "sentiment": "Body",
        "closing": "Bye",
    }
    create_resp = await async_client.post("/api/message-templates", json=payload)
    template_id = create_resp.json()["id"]

    resp = await async_client.put(
        f"/api/message-templates/{template_id}",
        json={"title": "Updated", "gender": "MALE"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated"
    assert resp.json()["gender"] == "MALE"


@pytest.mark.asyncio
async def test_update_message_template_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.put(
        f"/api/message-templates/{uuid4()}",
        json={"title": "Nope"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_message_template(async_client: AsyncClient) -> None:
    payload = {
        "title": "Delete Me",
        "greeting": "Hi",
        "sentiment": "Body",
        "closing": "Bye",
    }
    create_resp = await async_client.post("/api/message-templates", json=payload)
    template_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/message-templates/{template_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    list_resp = await async_client.get("/api/message-templates")
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_message_template_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/message-templates/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_message_templates_filter_by_gender(async_client: AsyncClient) -> None:
    await async_client.post("/api/message-templates", json={
        "title": "Male", "greeting": "Hi", "sentiment": "B", "closing": "C", "gender": "MALE",
    })
    await async_client.post("/api/message-templates", json={
        "title": "Female", "greeting": "Hi", "sentiment": "B", "closing": "C", "gender": "FEMALE",
    })

    resp = await async_client.get("/api/message-templates", params={"gender": "MALE"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["gender"] == "MALE"


@pytest.mark.asyncio
async def test_create_message_template_missing_required_fields(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/message-templates", json={"title": "Incomplete"})
    assert resp.status_code == 422
