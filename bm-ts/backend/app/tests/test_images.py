"""
tests/test_images.py — Tests for the images upload/management router.

Covers: upload from URL, upload base64 file, list, get, delete, validation.
"""

from __future__ import annotations

import base64
from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_images_empty(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/images")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_upload_image_from_url(async_client: AsyncClient) -> None:
    payload = {"url": "https://example.com/birthday-cake.jpg"}
    resp = await async_client.post("/api/images/upload", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["url"] == "https://example.com/birthday-cake.jpg"
    assert data["filename"] == "birthday-cake.jpg"
    assert "id" in data


@pytest.mark.asyncio
async def test_upload_image_file_base64(async_client: AsyncClient) -> None:
    # Create a small valid base64 payload (1x1 pixel PNG)
    pixel = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50).decode()
    raw_bytes = base64.b64decode(pixel)
    payload = {
        "filename": "test.png",
        "data": pixel,
        "size": len(raw_bytes),
    }
    resp = await async_client.post("/api/images/upload-file", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["filename"] == "test.png"
    assert data["size"] == len(raw_bytes)


@pytest.mark.asyncio
async def test_upload_image_file_size_mismatch(async_client: AsyncClient) -> None:
    pixel = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50).decode()
    payload = {
        "filename": "test.png",
        "data": pixel,
        "size": 999,  # Deliberately wrong
    }
    resp = await async_client.post("/api/images/upload-file", json=payload)
    assert resp.status_code == 400
    assert "Size mismatch" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_image_file_invalid_base64(async_client: AsyncClient) -> None:
    payload = {
        "filename": "test.png",
        "data": "not-valid-base64!!!",
        "size": 10,
    }
    resp = await async_client.post("/api/images/upload-file", json=payload)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_image(async_client: AsyncClient) -> None:
    create_resp = await async_client.post(
        "/api/images/upload", json={"url": "https://example.com/img.jpg"}
    )
    image_id = create_resp.json()["id"]

    resp = await async_client.get(f"/api/images/{image_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == image_id


@pytest.mark.asyncio
async def test_get_image_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.get(f"/api/images/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_image(async_client: AsyncClient) -> None:
    create_resp = await async_client.post(
        "/api/images/upload", json={"url": "https://example.com/del.jpg"}
    )
    image_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/images/{image_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    list_resp = await async_client.get("/api/images")
    assert len(list_resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_image_not_found(async_client: AsyncClient) -> None:
    resp = await async_client.delete(f"/api/images/{uuid4()}")
    assert resp.status_code == 404
