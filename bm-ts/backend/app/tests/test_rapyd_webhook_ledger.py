from __future__ import annotations
import base64, hashlib, hmac, json, time, uuid
import pytest
from sqlalchemy import func, select
from app.core.config import settings
from app.db.models import AccessEntitlement, PaymentTransaction, PaymentWebhookEvent

PATH="/api/payments/rapyd/webhook"
URL="https://api-v2.birthdaymessaging.io/api/payments/rapyd/webhook"
ACCESS="rapyd-webhook-access-test"
SECRET="rapyd-webhook-secret-test"
SALT="bm-ledger-salt"

def compact(p): return json.dumps(p,ensure_ascii=False,separators=(",",":"))
def sign(body,ts):
    raw=URL+SALT+ts+ACCESS+SECRET+body
    hx=hmac.new(SECRET.encode(),raw.encode(),hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(hx.encode()).decode()
def configure(monkeypatch):
    monkeypatch.setattr(settings,"rapyd_webhook_url",URL)
    monkeypatch.setattr(settings,"rapyd_access_key",ACCESS)
    monkeypatch.setattr(settings,"rapyd_secret_key",SECRET)
    monkeypatch.setattr(settings,"rapyd_webhook_max_age_seconds",60)
    monkeypatch.setattr(settings,"rapyd_webhook_max_future_seconds",5)
def event(event_id=None,payment_id=None):
    return {"id":event_id if event_id is not None else f"wh_{uuid.uuid4().hex}","type":"PAYMENT_COMPLETED","data":{"id":payment_id or f"payment_{uuid.uuid4().hex}","status":"CLO"},"status":"CLO"}
async def post(client,payload):
    body=compact(payload); ts=str(int(time.time()))
    return await client.post(PATH,content=body.encode(),headers={"salt":SALT,"timestamp":ts,"signature":sign(body,ts)})

@pytest.mark.asyncio
async def test_authenticated_event_enters_ledger(async_client,db_session,monkeypatch):
    configure(monkeypatch); p=event(); r=await post(async_client,p)
    assert r.status_code==200 and r.json()["reason"] in {"payment_not_found","missing_merchant_reference_id","non_settlement_event"}
    row=(await db_session.execute(select(PaymentWebhookEvent).where(PaymentWebhookEvent.provider=="rapyd",PaymentWebhookEvent.provider_event_id==p["id"]))).scalar_one()
    assert row.provider_delivery_id==p["id"]
    assert row.provider_payment_id==p["data"]["id"]
    assert row.processing_status in {"ignored","processed"}

@pytest.mark.asyncio
async def test_same_webhook_id_is_idempotent(async_client,db_session,monkeypatch):
    configure(monkeypatch); p=event()
    a=await post(async_client,p); b=await post(async_client,p)
    assert a.status_code==200
    assert b.json()["reason"]=="duplicate_event"
    n=await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent).where(PaymentWebhookEvent.provider=="rapyd",PaymentWebhookEvent.provider_event_id==p["id"]))
    assert n==1

@pytest.mark.asyncio
async def test_distinct_webhook_ids_same_payment_are_distinct_ledger_events(async_client,db_session,monkeypatch):
    configure(monkeypatch); pid=f"payment_{uuid.uuid4().hex}"
    assert (await post(async_client,event(payment_id=pid))).status_code==200
    assert (await post(async_client,event(payment_id=pid))).status_code==200
    n=await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent).where(PaymentWebhookEvent.provider=="rapyd",PaymentWebhookEvent.provider_payment_id==pid))
    assert n==2

@pytest.mark.asyncio
async def test_missing_root_id_does_not_enter_ledger(async_client,db_session,monkeypatch):
    configure(monkeypatch); p=event(); p["id"]=""
    before=await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    r=await post(async_client,p)
    after=await db_session.scalar(select(func.count()).select_from(PaymentWebhookEvent))
    assert r.status_code==200 and r.json()["reason"]=="missing_event_id" and after==before

@pytest.mark.asyncio
async def test_ledger_phase_has_no_payment_or_entitlement_side_effect(async_client,db_session,monkeypatch):
    configure(monkeypatch)
    bp=await db_session.scalar(select(func.count()).select_from(PaymentTransaction))
    be=await db_session.scalar(select(func.count()).select_from(AccessEntitlement))
    r=await post(async_client,event())
    assert r.status_code==200 and r.json()["processed"] is False
    assert await db_session.scalar(select(func.count()).select_from(PaymentTransaction))==bp
    assert await db_session.scalar(select(func.count()).select_from(AccessEntitlement))==be
