"""
tests/test_message_groups.py — Tests for the message groups CRUD router.

Covers: create, list, get, update, delete, gender filtering, validation.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_message_groups_empty(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/message-groups")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_message_group(async_client: AsyncClient) -> None:
    payload = {
        "name": "Female Birthday Greetings",
        "gender": "FEMALE",
        "segment_ids": [str(uuid4()), str(uuid4())],
    }
    resp = await async_client.post("/api/message-groups", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Female Birthday Greetings"
    assert data["gender"] == "FEMALE"
    assert len(data["segment_ids"]) == 2
    assert "id" in data


@pytest.mark.asyncio
async def test_create_message_group_default_gender(async_client: AsyncClient) -> None:
    payload = {"name": "General Group", "segment_ids": []}
    resp = await async_client.post("/api/message-groups", json=payload)
    assert resp.status_code == 201
    assert resp.json()["gender"] == "NEUTRAL"


@pytest.mark.asyncio
async def test_get_message_group(async_client: AsyncClient) -> None:
    payload = {"name": "Test Group", "segment_ids": []}
    create_resp = await async_client.post("/api/message-groups", json=payload)
    group_id = create_resp.json()["id"]

    resp = await async_client.get(f"/api/message-groups/{group_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == group_id


@pytest.mark.asyncio
async def test_get_message_group_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/message-groups/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_message_group(async_client: AsyncClient) -> None:
    payload = {"name": "Old Name", "segment_ids": []}
    create_resp = await async_client.post("/api/message-groups", json=payload)
    group_id = create_resp.json()["id"]

    resp = await async_client.put(
        f"/api/message-groups/{group_id}",
        json={"name": "New Name", "gender": "MALE"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["gender"] == "MALE"


@pytest.mark.asyncio
async def test_update_message_group_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.put(
        f"/api/message-groups/{uuid4()}",
        json={"name": "Nope"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_message_group(async_client: AsyncClient) -> None:
    payload = {"name": "Delete Me", "segment_ids": []}
    create_resp = await async_client.post("/api/message-groups", json=payload)
    group_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/message-groups/{group_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    list_resp = await async_client.get("/api/message-groups")
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_message_group_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/message-groups/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_message_groups_filter_by_gender(async_client: AsyncClient) -> None:
    await async_client.post("/api/message-groups", json={"name": "Male Group", "gender": "MALE", "segment_ids": []})
    await async_client.post("/api/message-groups", json={"name": "Female Group", "gender": "FEMALE", "segment_ids": []})

    resp = await async_client.get("/api/message-groups", params={"gender": "MALE"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["gender"] == "MALE"


@pytest.mark.asyncio
async def test_create_message_group_empty_name_rejected(async_client: AsyncClient) -> None:
    payload = {"name": "", "segment_ids": []}
    resp = await async_client.post("/api/message-groups", json=payload)
    assert resp.status_code == 422
