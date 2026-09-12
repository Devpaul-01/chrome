"""Tests for app.core.security_headers — SecurityHeadersMiddleware."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI
from starlette.responses import PlainTextResponse

from app.core.security_headers import SecurityHeadersMiddleware


@pytest.fixture()
def app_with_headers():
    """Minimal FastAPI app with only the security-headers middleware."""
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/hello")
    async def hello():
        return PlainTextResponse("ok")

    @app.get("/auth/login")
    async def auth_login():
        return PlainTextResponse("login")

    return app


@pytest_asyncio.fixture()
async def client(app_with_headers):
    transport = ASGITransport(app=app_with_headers)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestSecurityHeaders:
    async def test_hsts_header(self, client):
        r = await client.get("/hello")
        assert (
            r.headers["strict-transport-security"]
            == "max-age=31536000; includeSubDomains"
        )

    async def test_x_frame_options(self, client):
        r = await client.get("/hello")
        assert r.headers["x-frame-options"] == "DENY"

    async def test_x_content_type_options(self, client):
        r = await client.get("/hello")
        assert r.headers["x-content-type-options"] == "nosniff"

    async def test_csp_header(self, client):
        r = await client.get("/hello")
        assert "default-src 'self'" in r.headers["content-security-policy"]

    async def test_referrer_policy(self, client):
        r = await client.get("/hello")
        assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"

    async def test_permissions_policy(self, client):
        r = await client.get("/hello")
        assert "camera=()" in r.headers["permissions-policy"]

    async def test_auth_route_has_no_cache(self, client):
        r = await client.get("/auth/login")
        assert r.headers["cache-control"] == "no-store"
        assert r.headers["pragma"] == "no-cache"

    async def test_non_auth_route_has_no_cache_control(self, client):
        r = await client.get("/hello")
        # Non-auth routes should NOT get the no-cache headers
        assert r.headers.get("pragma") is None
