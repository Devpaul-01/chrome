"""Real PostgreSQL concurrency acceptance for Rapyd webhook settlement."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import urlparse

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.models import (
    AccessEntitlement,
    NotificationOutbox,
    PaymentTransaction,
    PaymentWebhookEvent,
    User,
)
from app.db.session import get_db
from app.main import app

DB_URL=os.environ.get("CONCURRENCY_DATABASE_URL","").strip()
pytestmark=pytest.mark.skipif(not DB_URL,reason="CONCURRENCY_DATABASE_URL required")
URL="https://api-v2.birthdaymessaging.io/api/payments/rapyd/webhook"
ACCESS="rapyd-pg-access-test"; SECRET="rapyd-pg-secret-test"; SALT="rapyd-pg-salt"
PATH="/api/payments/rapyd/webhook"

def _safe(url):
    name=(urlparse(url.replace("postgresql+asyncpg://","postgresql://",1)).path or "").lstrip("/").lower()
    if "test" not in name: raise RuntimeError(f"Refusing non-test database {name!r}")
if DB_URL: _safe(DB_URL)

engine=create_async_engine(DB_URL,poolclass=NullPool) if DB_URL else None
Session=async_sessionmaker(engine,class_=AsyncSession,expire_on_commit=False,autoflush=False) if engine else None

@pytest.fixture(autouse=True)
def config(monkeypatch):
    monkeypatch.setattr(settings,"rapyd_webhook_url",URL)
    monkeypatch.setattr(settings,"rapyd_access_key",ACCESS)
    monkeypatch.setattr(settings,"rapyd_secret_key",SECRET)
    monkeypatch.setattr(settings,"rapyd_webhook_max_age_seconds",60)
    monkeypatch.setattr(settings,"rapyd_webhook_max_future_seconds",5)

@asynccontextmanager
async def client():
    async def odb():
        async with Session() as db: yield db
    old=app.dependency_overrides.get(get_db); app.dependency_overrides[get_db]=odb
    try:
        async with AsyncClient(transport=ASGITransport(app=app),base_url="http://rapyd-pg.test") as c: yield c
    finally:
        if old is None: app.dependency_overrides.pop(get_db,None)
        else: app.dependency_overrides[get_db]=old

def compact(x): return json.dumps(x,separators=(",",":"))
def signature(body,ts):
    raw=URL+SALT+ts+ACCESS+SECRET+body
    hx=hmac.new(SECRET.encode(),raw.encode(),hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(hx.encode()).decode()
async def post(c,p):
    body=compact(p); ts=str(int(time.time()))
    return await c.post(PATH,content=body.encode(),headers={"salt":SALT,"timestamp":ts,"signature":signature(body,ts)})

async def seed(label):
    uid=uuid.uuid4(); tid=uuid.uuid4(); ref=f"BM-RAPYD-{uuid.uuid4()}"; now=datetime.now(timezone.utc)
    async with Session() as db:
        db.add(User(id=uid,email=f"{label}-{uid.hex}@example.test",password_hash="not-real",created_at=now,updated_at=now,failed_login_count=0,locked_until=None,email_verified=True,metadata_payload={"test":"rapyd-webhook-pg"}))
        db.add(PaymentTransaction(id=tid,user_id=uid,provider="rapyd",provider_payment_id=None,provider_order_id=ref,amount=Decimal("10.00"),currency="USD",status="NEW",checkout_url="https://checkout.test",payment_method="rapyd_hosted_checkout",plan_code="monthly",paid_at=None,expires_at=None,created_at=now,updated_at=now,metadata_payload={"billing_term_months":1,"rapyd_checkout_id":f"checkout_{uuid.uuid4().hex}"}))
        await db.commit()
    return uid,tid,ref

def event(ref,payment_id,event_id=None):
    return {"id":event_id or f"wh_{uuid.uuid4().hex}","type":"PAYMENT_COMPLETED","data":{"id":payment_id,"paid":True,"amount":0,"original_amount":10.00,"currency_code":"USD","status":"CLO","is_partial":False,"merchant_reference_id":ref},"status":"NEW"}

async def counts(tid,payment_id):
    async with Session() as db:
        tx=await db.get(PaymentTransaction,tid)
        ents=await db.scalar(select(func.count()).select_from(AccessEntitlement).where(AccessEntitlement.source_transaction_id==tid))
        events=await db.scalar(select(func.count()).select_from(PaymentWebhookEvent).where(PaymentWebhookEvent.provider=="rapyd",PaymentWebhookEvent.provider_payment_id==payment_id))
        notes=(await db.execute(select(NotificationOutbox).where(NotificationOutbox.source_transaction_id==tid))).scalars().all()
        return tx,int(ents or 0),int(events or 0),notes

async def cleanup():
    async with Session() as db:
        ids=(await db.execute(select(User.id).where(User.metadata_payload["test"].as_string()=="rapyd-webhook-pg"))).scalars().all()
        if ids:
            await db.execute(delete(User).where(User.id.in_(ids))); await db.commit()

@pytest.fixture(autouse=True)
async def clean():
    await cleanup(); yield; await cleanup()

@pytest.mark.asyncio
async def test_identical_webhook_concurrent_delivery_settles_once():
    _,tid,ref=await seed("same-event"); pid=f"payment_{uuid.uuid4().hex}"; p=event(ref,pid)
    async with client() as c:
        a,b=await asyncio.wait_for(asyncio.gather(post(c,p),post(c,p)),timeout=20)
    assert a.status_code==200 and b.status_code==200,(a.text,b.text)
    tx,ents,events,notes=await counts(tid,pid)
    assert tx.status=="Settled" and tx.provider_payment_id==pid and tx.paid_at is not None
    assert ents==1 and events==1
    keys=[n.idempotency_key for n in notes]
    assert len(keys)==len(set(keys))
    assert sum(n.notification_type=="subscription_activated" for n in notes)==1

@pytest.mark.asyncio
async def test_distinct_event_ids_same_payment_concurrently_do_not_double_grant():
    _,tid,ref=await seed("distinct-events"); pid=f"payment_{uuid.uuid4().hex}"
    p1=event(ref,pid); p2=event(ref,pid)
    async with client() as c:
        a,b=await asyncio.wait_for(asyncio.gather(post(c,p1),post(c,p2)),timeout=20)
    assert a.status_code==200 and b.status_code==200,(a.text,b.text)
    tx,ents,events,notes=await counts(tid,pid)
    assert tx.status=="Settled" and tx.provider_payment_id==pid
    assert ents==1 and events==2
    keys=[n.idempotency_key for n in notes]
    assert len(keys)==len(set(keys))
    assert sum(n.notification_type=="subscription_activated" for n in notes)==1

@pytest.mark.asyncio
async def test_same_payment_id_cannot_bind_two_local_transactions():
    _,t1,r1=await seed("payment-owner-a"); _,t2,r2=await seed("payment-owner-b")
    pid=f"payment_{uuid.uuid4().hex}"
    async with client() as c:
        first=await post(c,event(r1,pid))
        assert first.status_code==200 and first.json().get("settled") is True,first.text
        second=await post(c,event(r2,pid))
    assert second.status_code==200,second.text
    assert second.json()["reason"]=="payment_identity_already_bound"
    async with Session() as db:
        a=await db.get(PaymentTransaction,t1); b=await db.get(PaymentTransaction,t2)
        assert a.provider_payment_id==pid and a.status=="Settled"
        assert b.provider_payment_id is None and b.paid_at is None
        assert await db.scalar(select(func.count()).select_from(AccessEntitlement).where(AccessEntitlement.source_transaction_id==t2))==0

@pytest.mark.asyncio
async def test_failed_event_can_retry_after_financial_truth_is_corrected():
    _,tid,ref=await seed("retry"); pid=f"payment_{uuid.uuid4().hex}"; eid=f"wh_{uuid.uuid4().hex}"
    bad=event(ref,pid,eid); bad["data"]["original_amount"]="not-money"
    async with client() as c:
        first=await post(c,bad)
        assert first.status_code==200
        assert first.json()["reason"]=="settlement_failed"
        good=event(ref,pid,eid)
        second=await post(c,good)
    assert second.status_code==200 and second.json().get("settled") is True,second.text
    tx,ents,events,notes=await counts(tid,pid)
    assert tx.status=="Settled" and tx.provider_payment_id==pid
    assert ents==1 and events==1
