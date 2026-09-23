from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.db.models import PaymentWebhookEvent


PATH = "/api/payments/rapyd/webhook"
WEBHOOK_URL = "https://api-v2.birthdaymessaging.io/api/payments/rapyd/webhook"
ACCESS_KEY = "rapyd-webhook-access-test"
SECRET_KEY = "rapyd-webhook-secret-test"
SALT = "bm-test-salt"


def _compact(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _sign(body_string: str, timestamp: str) -> str:
    value = WEBHOOK_URL + SALT + timestamp + ACCESS_KEY + SECRET_KEY + body_string
    digest_hex = hmac.new(SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(digest_hex.encode()).decode()


def _configure(monkeypatch):
    monkeypatch.setattr(settings, "rapyd_webhook_url", WEBHOOK_URL)
    monkeypatch.setattr(settings, "rapyd_access_key", ACCESS_KEY)
    monkeypatch.setattr(settings, "rapyd_secret_key", SECRET_KEY)
    monkeypatch.setattr(settings, "rapyd_webhook_max_age_seconds", 60)
    monkeypatch.setattr(settings, "rapyd_webhook_max_future_seconds", 5)
    monkeypatch.setattr(settings, "rapyd_webhook_max_body_bytes", 262144)


def _event():
    return {
        "id": "wh_bm_auth_test",
        "type": "PAYMENT_COMPLETED",
        "data": {"id": "payment_bm_auth_test", "status": "CLO"},
        "status": "CLO",
    }


async def _count(db):
    return await db.scalar(select(func.count()).select_from(PaymentWebhookEvent))


@pytest.mark.asyncio
async def test_valid_signature_is_accepted(async_client, db_session, monkeypatch):
    _configure(monkeypatch)
    body = _compact(_event())
    timestamp = str(int(time.time()))
    response = await async_client.post(
        PATH,
        content=body.encode(),
        headers={"salt": SALT, "timestamp": timestamp, "signature": _sign(body, timestamp)},
    )
    assert response.status_code == 200, response.text
    assert response.json()["processed"] is False
    assert response.json()["reason"] in {
        "missing_merchant_reference_id",
        "duplicate_event",
        "duplicate_in_progress",
    }


@pytest.mark.asyncio
async def test_pretty_json_accepts_documented_compact_signature(async_client, db_session, monkeypatch):
    _configure(monkeypatch)
    payload = _event()
    compact = _compact(payload)
    pretty = json.dumps(payload, indent=2)
    timestamp = str(int(time.time()))
    response = await async_client.post(
        PATH,
        content=pretty.encode(),
        headers={"salt": SALT, "timestamp": timestamp, "signature": _sign(compact, timestamp)},
    )
    assert response.status_code == 200, response.text
    assert response.json()["processed"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("headers", [{}, {"salt": SALT}, {"timestamp": "1"}, {"signature": "x"}])
async def test_missing_auth_headers_fail_closed(async_client, db_session, monkeypatch, headers):
    _configure(monkeypatch)
    before = await _count(db_session)
    response = await async_client.post(PATH, content=_compact(_event()).encode(), headers=headers)
    assert response.status_code == 401
    assert await _count(db_session) == before


@pytest.mark.asyncio
async def test_invalid_signature_fails_before_db_mutation(async_client, db_session, monkeypatch):
    _configure(monkeypatch)
    timestamp = str(int(time.time()))
    before = await _count(db_session)
    response = await async_client.post(
        PATH,
        content=_compact(_event()).encode(),
        headers={"salt": SALT, "timestamp": timestamp, "signature": "invalid"},
    )
    assert response.status_code == 401
    assert await _count(db_session) == before


@pytest.mark.asyncio
async def test_stale_future_and_malformed_timestamps_fail_closed(async_client, db_session, monkeypatch):
    _configure(monkeypatch)
    body = _compact(_event())
    now = int(time.time())
    before = await _count(db_session)
    for timestamp in (str(now - 61), str(now + 6), "not-an-int"):
        signature = _sign(body, timestamp)
        response = await async_client.post(
            PATH,
            content=body.encode(),
            headers={"salt": SALT, "timestamp": timestamp, "signature": signature},
        )
        assert response.status_code == 401
    assert await _count(db_session) == before


@pytest.mark.asyncio
async def test_malformed_json_rejected_without_db_mutation(async_client, db_session, monkeypatch):
    _configure(monkeypatch)
    raw = b'{"broken":'
    timestamp = str(int(time.time()))
    before = await _count(db_session)
    response = await async_client.post(
        PATH,
        content=raw,
        headers={"salt": SALT, "timestamp": timestamp, "signature": _sign(raw.decode(), timestamp)},
    )
    assert response.status_code == 400
    assert await _count(db_session) == before


@pytest.mark.asyncio
async def test_unconfigured_webhook_fails_closed(async_client, db_session, monkeypatch):
    _configure(monkeypatch)
    monkeypatch.setattr(settings, "rapyd_webhook_url", "")
    body = _compact(_event())
    timestamp = str(int(time.time()))
    before = await _count(db_session)
    response = await async_client.post(
        PATH,
        content=body.encode(),
        headers={"salt": SALT, "timestamp": timestamp, "signature": _sign(body, timestamp)},
    )
    assert response.status_code == 503
    assert await _count(db_session) == before


@pytest.mark.asyncio
async def test_declared_oversized_webhook_rejected_before_ledger(
    async_client, db_session, monkeypatch
):
    _configure(monkeypatch)
    monkeypatch.setattr(settings, "rapyd_webhook_max_body_bytes", 32)
    before = await _count(db_session)
    response = await async_client.post(
        PATH,
        content=b"{}",
        headers={"Content-Length": "33"},
    )
    assert response.status_code == 413
    assert await _count(db_session) == before


@pytest.mark.asyncio
async def test_actual_oversized_webhook_rejected_without_ledger_mutation(
    async_client, db_session, monkeypatch
):
    _configure(monkeypatch)
    monkeypatch.setattr(settings, "rapyd_webhook_max_body_bytes", 32)
    body = b"{" + b"x" * 64 + b"}"
    before = await _count(db_session)
    response = await async_client.post(PATH, content=body)
    assert response.status_code == 413
    assert await _count(db_session) == before
