"""
tests/test_posts.py — Tests for the posts CRUD router.

Covers: create, list, get, update, delete, gender filtering, validation.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_posts_empty(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/posts")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_post(async_client: AsyncClient) -> None:
    payload = {
        "content": "Happy Birthday! 🎂",
        "gender": "NEUTRAL",
    }
    resp = await async_client.post("/api/posts", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["content"] == "Happy Birthday! 🎂"
    assert data["gender"] == "NEUTRAL"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_post_with_options(async_client: AsyncClient) -> None:
    payload = {
        "content": "Wishing you well!",
        "gender": "FEMALE",
        "image_url": "https://example.com/cake.png",
        "label": "Cake theme",
        "font_family": "Georgia",
        "font_size": 36,
        "font_color": "#ff0000",
    }
    resp = await async_client.post("/api/posts", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["gender"] == "FEMALE"
    assert data["label"] == "Cake theme"


@pytest.mark.asyncio
async def test_get_post(async_client: AsyncClient) -> None:
    create_resp = await async_client.post("/api/posts", json={"content": "Test post"})
    post_id = create_resp.json()["id"]

    resp = await async_client.get(f"/api/posts/{post_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == post_id


@pytest.mark.asyncio
async def test_get_post_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/posts/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_post(async_client: AsyncClient) -> None:
    create_resp = await async_client.post("/api/posts", json={"content": "Original"})
    post_id = create_resp.json()["id"]

    resp = await async_client.put(
        f"/api/posts/{post_id}",
        json={"content": "Updated", "gender": "MALE"},
    )
    assert resp.status_code == 200
    assert resp.json()["content"] == "Updated"
    assert resp.json()["gender"] == "MALE"


@pytest.mark.asyncio
async def test_update_post_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.put(
        f"/api/posts/{uuid4()}",
        json={"content": "Nope"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_post(async_client: AsyncClient) -> None:
    create_resp = await async_client.post("/api/posts", json={"content": "Delete me"})
    post_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/posts/{post_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    list_resp = await async_client.get("/api/posts")
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_post_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/posts/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_posts_filter_by_gender(async_client: AsyncClient) -> None:
    await async_client.post(
        "/api/posts", json={"content": "Male post", "gender": "MALE"}
    )
    await async_client.post(
        "/api/posts", json={"content": "Female post", "gender": "FEMALE"}
    )

    resp = await async_client.get("/api/posts", params={"gender": "MALE"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["gender"] == "MALE"


@pytest.mark.asyncio
async def test_create_post_empty_content_rejected(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/posts", json={"content": ""})
    assert resp.status_code == 422
