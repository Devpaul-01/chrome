"""
tests/test_schedules.py — Tests for the birthday schedules CRUD router.

Covers: list, create, duplicate rejection, update, delete, 404 handling.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_schedules_empty(async_client: AsyncClient) -> None:
    """Empty user should return an empty list."""
    resp = await async_client.get("/api/schedules")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_schedule(async_client: AsyncClient) -> None:
    """Creating a schedule returns 201 with the correct fields."""
    resp = await async_client.post("/api/schedules", json={"days_before": 3, "enabled": True})
    assert resp.status_code == 201
    data = resp.json()
    assert data["days_before"] == 3
    assert data["enabled"] is True
    assert "id" in data
    assert "user_id" in data


@pytest.mark.asyncio
async def test_create_schedule_default_enabled(async_client: AsyncClient) -> None:
    """Enabled defaults to True if not provided."""
    resp = await async_client.post("/api/schedules", json={"days_before": 5})
    assert resp.status_code == 201
    assert resp.json()["enabled"] is True


@pytest.mark.asyncio
async def test_create_duplicate_schedule_rejected(async_client: AsyncClient) -> None:
    """Creating a schedule with the same days_before for the same user returns 400."""
    await async_client.post("/api/schedules", json={"days_before": 3})
    resp = await async_client.post("/api/schedules", json={"days_before": 3})
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_list_schedules_after_create(async_client: AsyncClient) -> None:
    """After creating schedules, list returns them sorted by days_before."""
    await async_client.post("/api/schedules", json={"days_before": 7})
    await async_client.post("/api/schedules", json={"days_before": 1})
    resp = await async_client.get("/api/schedules")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["days_before"] <= data[1]["days_before"]


@pytest.mark.asyncio
async def test_update_schedule_enabled(async_client: AsyncClient) -> None:
    """Updating the enabled field toggles it correctly."""
    create_resp = await async_client.post("/api/schedules", json={"days_before": 2, "enabled": True})
    schedule_id = create_resp.json()["id"]

    resp = await async_client.put(f"/api/schedules/{schedule_id}", json={"enabled": False})
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_update_schedule_not_found(async_client: AsyncClient) -> None:
    """Updating a non-existent schedule returns 404."""
    import uuid
    fake_id = str(uuid.uuid4())
    resp = await async_client.put(f"/api/schedules/{fake_id}", json={"enabled": False})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_schedule(async_client: AsyncClient) -> None:
    """Deleting a schedule returns 200 and the schedule is gone."""
    create_resp = await async_client.post("/api/schedules", json={"days_before": 10})
    schedule_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/schedules/{schedule_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    # Verify it's gone
    list_resp = await async_client.get("/api/schedules")
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_schedule_not_found(async_client: AsyncClient) -> None:
    """Deleting a non-existent schedule returns 404."""
    import uuid
    fake_id = str(uuid.uuid4())
    resp = await async_client.delete(f"/api/schedules/{fake_id}")
    assert resp.status_code == 404
