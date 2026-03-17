"""
tests/test_contacts.py — Tests for the contacts CRUD router.

Covers: create, list, update, delete, bulk create, 404 handling.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_contacts_empty(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/contacts/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_contact(async_client: AsyncClient) -> None:
    payload = {
        "name": "Jane Doe",
        "facebook_profile_url": "https://facebook.com/janedoe",
        "birthday": datetime.now(timezone.utc).isoformat(),
        "gender": "FEMALE",
        "notes": "College friend",
    }
    resp = await async_client.post("/api/contacts/", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Jane Doe"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_contact_without_optional_fields(async_client: AsyncClient) -> None:
    payload = {
        "name": "Bob",
        "facebook_profile_url": "https://facebook.com/bob",
        "birthday": datetime.now(timezone.utc).isoformat(),
    }
    resp = await async_client.post("/api/contacts/", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["gender"] is None
    assert data["notes"] is None


@pytest.mark.asyncio
async def test_list_contacts_after_create(async_client: AsyncClient) -> None:
    payload = {
        "name": "Alice",
        "facebook_profile_url": "https://facebook.com/alice",
        "birthday": datetime.now(timezone.utc).isoformat(),
    }
    await async_client.post("/api/contacts/", json=payload)
    resp = await async_client.get("/api/contacts/")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_bulk_create_contacts(async_client: AsyncClient) -> None:
    contacts = [
        {
            "name": f"Contact {i}",
            "facebook_profile_url": f"https://facebook.com/c{i}",
            "birthday": datetime.now(timezone.utc).isoformat(),
        }
        for i in range(3)
    ]
    resp = await async_client.post("/api/contacts/bulk", json=contacts)
    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 3


@pytest.mark.asyncio
async def test_update_contact(async_client: AsyncClient) -> None:
    payload = {
        "name": "UpdateMe",
        "facebook_profile_url": "https://facebook.com/updateme",
        "birthday": datetime.now(timezone.utc).isoformat(),
    }
    create_resp = await async_client.post("/api/contacts/", json=payload)
    contact_id = create_resp.json()["id"]

    resp = await async_client.put(
        f"/api/contacts/{contact_id}",
        json={"name": "Updated Name", "gender": "MALE"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_update_contact_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.put(
        f"/api/contacts/{uuid4()}",
        json={"name": "Nope"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_contact(async_client: AsyncClient) -> None:
    payload = {
        "name": "DeleteMe",
        "facebook_profile_url": "https://facebook.com/deleteme",
        "birthday": datetime.now(timezone.utc).isoformat(),
    }
    create_resp = await async_client.post("/api/contacts/", json=payload)
    contact_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/contacts/{contact_id}")
    assert resp.status_code == 200

    # Verify gone
    list_resp = await async_client.get("/api/contacts/")
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_contact_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/contacts/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_contact_empty_name_rejected(async_client: AsyncClient) -> None:
    payload = {
        "name": "",
        "facebook_profile_url": "https://facebook.com/noname",
        "birthday": datetime.now(timezone.utc).isoformat(),
    }
    resp = await async_client.post("/api/contacts/", json=payload)
    assert resp.status_code == 422  # Validation error
