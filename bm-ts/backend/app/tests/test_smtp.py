"""
tests/test_smtp.py — Tests for the SMTP configuration router.

Covers: get (empty), create via PUT, update via PUT, password masking.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_smtp_config_none(async_client: AsyncClient) -> None:
    resp = await async_client.get("/smtp/config")
    assert resp.status_code == 200
    assert resp.json() is None


@pytest.mark.asyncio
async def test_create_smtp_config(async_client: AsyncClient) -> None:
    payload = {
        "host": "smtp.example.com",
        "port": 587,
        "username": "user@example.com",
        "password": "secret123",
        "use_tls": True,
        "from_email": "user@example.com",
        "from_name": "Birthday Bot",
    }
    resp = await async_client.put("/smtp/config", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["host"] == "smtp.example.com"
    assert data["port"] == 587
    assert data["username"] == "user@example.com"
    assert data["password"] == "••••••••"
    assert data["from_name"] == "Birthday Bot"


@pytest.mark.asyncio
async def test_get_smtp_config_after_create(async_client: AsyncClient) -> None:
    await async_client.put(
        "/smtp/config",
        json={
            "host": "smtp.test.com",
            "port": 465,
            "username": "test@test.com",
            "password": "pass",
            "use_tls": False,
            "from_email": "test@test.com",
        },
    )

    resp = await async_client.get("/smtp/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["host"] == "smtp.test.com"
    assert data["password"] == "••••••••"


@pytest.mark.asyncio
async def test_update_smtp_config(async_client: AsyncClient) -> None:
    # Create first
    await async_client.put(
        "/smtp/config",
        json={
            "host": "old.smtp.com",
            "port": 587,
            "username": "old@old.com",
            "password": "oldpass",
            "use_tls": True,
            "from_email": "old@old.com",
        },
    )

    # Update
    resp = await async_client.put(
        "/smtp/config",
        json={
            "host": "new.smtp.com",
            "port": 465,
            "username": "new@new.com",
            "password": "newpass",
            "use_tls": False,
            "from_email": "new@new.com",
            "from_name": "New Bot",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["host"] == "new.smtp.com"
    assert data["port"] == 465
    assert data["password"] == "••••••••"


@pytest.mark.asyncio
async def test_create_smtp_config_validation(async_client: AsyncClient) -> None:
    # Missing required fields
    resp = await async_client.put("/smtp/config", json={"host": "smtp.test.com"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_smtp_config_invalid_port(async_client: AsyncClient) -> None:
    payload = {
        "host": "smtp.test.com",
        "port": 99999,  # Invalid port
        "username": "user",
        "password": "pass",
        "use_tls": True,
        "from_email": "user@test.com",
    }
    resp = await async_client.put("/smtp/config", json=payload)
    assert resp.status_code == 422
