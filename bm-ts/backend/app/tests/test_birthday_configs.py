"""
tests/test_birthday_configs.py — Tests for the birthday configs CRUD router.

Covers: create, list, get, update, toggle, delete, filtering, validation.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_birthday_configs_empty(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/birthday-configs")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_birthday_config_normal(async_client: AsyncClient) -> None:
    payload = {
        "mode": "ON_DAY",
        "days_offset": 0,
        "gender_filter": "ALL",
        "archive_enabled": False,
        "enabled": True,
    }
    resp = await async_client.post("/api/birthday-configs", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["mode"] == "ON_DAY"
    assert data["days_offset"] == 0
    assert data["enabled"] is True
    assert "id" in data


@pytest.mark.asyncio
async def test_create_birthday_config_advance(async_client: AsyncClient) -> None:
    payload = {
        "mode": "EARLY",
        "days_offset": -3,
        "gender_filter": "FEMALE",
    }
    resp = await async_client.post("/api/birthday-configs", json=payload)
    assert resp.status_code == 201
    assert resp.json()["days_offset"] == -3


@pytest.mark.asyncio
async def test_create_birthday_config_followup(async_client: AsyncClient) -> None:
    payload = {
        "mode": "BELATED",
        "days_offset": 2,
    }
    resp = await async_client.post("/api/birthday-configs", json=payload)
    assert resp.status_code == 201
    assert resp.json()["days_offset"] == 2


@pytest.mark.asyncio
async def test_create_birthday_config_invalid_offset(async_client: AsyncClient) -> None:
    payload = {
        "mode": "ON_DAY",
        "days_offset": 5,
    }
    resp = await async_client.post("/api/birthday-configs", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_birthday_config(async_client: AsyncClient) -> None:
    payload = {"mode": "ON_DAY", "days_offset": 0}
    create_resp = await async_client.post("/api/birthday-configs", json=payload)
    config_id = create_resp.json()["id"]

    resp = await async_client.get(f"/api/birthday-configs/{config_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == config_id


@pytest.mark.asyncio
async def test_get_birthday_config_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/birthday-configs/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_birthday_config(async_client: AsyncClient) -> None:
    payload = {"mode": "ON_DAY", "days_offset": 0, "enabled": True}
    create_resp = await async_client.post("/api/birthday-configs", json=payload)
    config_id = create_resp.json()["id"]

    resp = await async_client.put(
        f"/api/birthday-configs/{config_id}",
        json={"enabled": False, "archive_enabled": True},
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False
    assert resp.json()["archive_enabled"] is True


@pytest.mark.asyncio
async def test_toggle_birthday_config(async_client: AsyncClient) -> None:
    payload = {"mode": "ON_DAY", "days_offset": 0, "enabled": True}
    create_resp = await async_client.post("/api/birthday-configs", json=payload)
    config_id = create_resp.json()["id"]

    resp = await async_client.patch(
        f"/api/birthday-configs/{config_id}/toggle",
        json={"enabled": False},
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_delete_birthday_config(async_client: AsyncClient) -> None:
    payload = {"mode": "ON_DAY", "days_offset": 0}
    create_resp = await async_client.post("/api/birthday-configs", json=payload)
    config_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/birthday-configs/{config_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    # Verify gone
    list_resp = await async_client.get("/api/birthday-configs")
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_birthday_config_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/birthday-configs/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_birthday_configs_filter_by_mode(async_client: AsyncClient) -> None:
    await async_client.post(
        "/api/birthday-configs", json={"mode": "ON_DAY", "days_offset": 0}
    )
    await async_client.post(
        "/api/birthday-configs", json={"mode": "EARLY", "days_offset": -1}
    )

    resp = await async_client.get("/api/birthday-configs", params={"mode": "ON_DAY"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["mode"] == "ON_DAY"


@pytest.mark.asyncio
async def test_list_birthday_configs_filter_by_enabled(
    async_client: AsyncClient,
) -> None:
    await async_client.post(
        "/api/birthday-configs",
        json={"mode": "ON_DAY", "days_offset": 0, "enabled": True},
    )
    await async_client.post(
        "/api/birthday-configs",
        json={"mode": "BELATED", "days_offset": 1, "enabled": False},
    )

    resp = await async_client.get("/api/birthday-configs", params={"enabled": "true"})
    assert resp.status_code == 200
    assert all(c["enabled"] for c in resp.json())
