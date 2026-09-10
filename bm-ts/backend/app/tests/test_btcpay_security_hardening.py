import hashlib
import hmac
import json
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import PaymentWebhookEvent
from app.main import app

SECRET = "hardening-webhook-secret"
PATH = "/api/payments/btcpay/webhook"

def sign(raw):
    return "sha256=" + hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()

@pytest.mark.asyncio
async def test_webhook_missing_signature_rejected(async_client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "btcpay_webhook_secret", SECRET)
    before = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    r = await async_client.post(PATH, content=b'{"type":"InvoiceSettled"}', headers={"Content-Type":"application/json"})
    assert r.status_code == 401
    after = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    assert after == before

@pytest.mark.asyncio
async def test_webhook_unconfigured_secret_fails_closed(async_client, monkeypatch):
    monkeypatch.setattr(settings, "btcpay_webhook_secret", "")
    raw = b'{"type":"InvoiceSettled"}'
    r = await async_client.post(PATH, content=raw, headers={"Content-Type":"application/json","BTCPAY-SIG":"sha256=anything"})
    assert r.status_code == 503

@pytest.mark.asyncio
async def test_webhook_signed_malformed_json_rejected_without_record(async_client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "btcpay_webhook_secret", SECRET)
    raw = b'{"broken":'
    before = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    r = await async_client.post(PATH, content=raw, headers={"Content-Type":"application/json","BTCPAY-SIG":sign(raw)})
    assert r.status_code == 400
    after = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    assert after == before

@pytest.mark.asyncio
async def test_webhook_signed_non_object_json_rejected_without_record(async_client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "btcpay_webhook_secret", SECRET)
    raw = b'["not","an","event"]'
    before = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    r = await async_client.post(PATH, content=raw, headers={"Content-Type":"application/json","BTCPAY-SIG":sign(raw)})
    assert r.status_code == 400
    after = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    assert after == before

@pytest.mark.asyncio
async def test_webhook_missing_event_id_acknowledged_without_record(async_client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "btcpay_webhook_secret", SECRET)
    raw = json.dumps({"type":"StoreRateChanged"},separators=(",",":")).encode()
    before = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    r = await async_client.post(PATH, content=raw, headers={"Content-Type":"application/json","BTCPAY-SIG":sign(raw)})
    assert r.status_code == 200
    assert r.json()["processed"] is False
    assert r.json()["reason"] == "missing_event_id"
    after = await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    assert after == before

@pytest.mark.asyncio
async def test_checkout_requires_authentication():
    previous = dict(app.dependency_overrides)
    app.dependency_overrides.pop(get_current_user, None)
    try:
        async with AsyncClient(transport=ASGITransport(app=app),base_url="http://test") as client:
            r = await client.post("/api/payments/btcpay/checkout",headers={"Idempotency-Key":"security-hardening-123456"},json={"plan_code":"monthly","payment_method":"monero"})
        assert r.status_code in (401,403)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
