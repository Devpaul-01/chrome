from __future__ import annotations
import base64, hashlib, hmac, json, time, uuid
from datetime import datetime, timezone
from decimal import Decimal
import pytest
from sqlalchemy import func, select
from app.core.config import settings
from app.db.models import AccessEntitlement, PaymentTransaction

PATH="/api/payments/rapyd/webhook"; URL="https://api-v2.birthdaymessaging.io/api/payments/rapyd/webhook"
ACCESS="rapyd-webhook-access-test"; SECRET="rapyd-webhook-secret-test"; SALT="settlement-salt"

def compact(x): return json.dumps(x,separators=(",",":"))
def sig(body,ts):
    raw=URL+SALT+ts+ACCESS+SECRET+body
    hx=hmac.new(SECRET.encode(),raw.encode(),hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(hx.encode()).decode()
def cfg(m):
    m.setattr(settings,"rapyd_webhook_url",URL); m.setattr(settings,"rapyd_access_key",ACCESS)
    m.setattr(settings,"rapyd_secret_key",SECRET); m.setattr(settings,"rapyd_webhook_max_age_seconds",60)
    m.setattr(settings,"rapyd_webhook_max_future_seconds",5)
async def post(c,p):
    b=compact(p); ts=str(int(time.time()))
    return await c.post(PATH,content=b.encode(),headers={"salt":SALT,"timestamp":ts,"signature":sig(b,ts)})
async def tx(db,user):
    now=datetime.now(timezone.utc); checkout=f"checkout_{uuid.uuid4().hex}"
    x=PaymentTransaction(id=uuid.uuid4(),user_id=user.id,provider="rapyd",provider_payment_id=None,provider_order_id=f"BM-RAPYD-{uuid.uuid4()}",amount=Decimal("10.00"),currency="USD",status="NEW",checkout_url="https://checkout.test",payment_method="rapyd_hosted_checkout",plan_code="monthly",paid_at=None,expires_at=None,created_at=now,updated_at=now,metadata_payload={"billing_term_months":1,"rapyd_checkout_id":checkout})
    db.add(x); await db.commit(); await db.refresh(x); return x
def evt(x,**kw):
    d={"id":f"payment_{uuid.uuid4().hex}","paid":True,"amount":0,"original_amount":10.00,"currency_code":"USD","status":"CLO","is_partial":False,"merchant_reference_id":x.provider_order_id}; d.update(kw)
    return {"id":f"wh_{uuid.uuid4().hex}","type":"PAYMENT_COMPLETED","data":d,"status":"NEW"}

@pytest.mark.asyncio
async def test_full_payment_settles_and_grants_once(async_client,db_session,test_user,monkeypatch):
    cfg(monkeypatch); x=await tx(db_session,test_user); p=evt(x)
    r=await post(async_client,p); assert r.status_code==200 and r.json()["settled"] is True
    await db_session.refresh(x); assert x.status=="Settled" and x.paid_at and x.provider_payment_id==p["data"]["id"]
    assert x.metadata_payload["rapyd_checkout_id"].startswith("checkout_")
    tx_id=x.id
    n=await db_session.scalar(select(func.count()).select_from(AccessEntitlement).where(AccessEntitlement.source_transaction_id==tx_id)); assert n==1
    r2=await post(async_client,p); assert r2.json()["reason"]=="duplicate_event"
    n2=await db_session.scalar(select(func.count()).select_from(AccessEntitlement).where(AccessEntitlement.source_transaction_id==tx_id)); assert n2==1

@pytest.mark.asyncio
@pytest.mark.parametrize("bad",[{"paid":False},{"is_partial":True},{"status":"ACT"},{"original_amount":9.99},{"currency_code":"EUR"}])
async def test_bad_financial_truth_never_grants(async_client,db_session,test_user,monkeypatch,bad):
    cfg(monkeypatch); x=await tx(db_session,test_user); r=await post(async_client,evt(x,**bad))
    assert r.status_code==200 and r.json()["settled"] is False
    await db_session.refresh(x); assert x.paid_at is None and x.provider_payment_id is None
    assert await db_session.scalar(select(func.count()).select_from(AccessEntitlement).where(AccessEntitlement.source_transaction_id==x.id))==0

@pytest.mark.asyncio
async def test_reference_mismatch_never_binds(async_client,db_session,test_user,monkeypatch):
    cfg(monkeypatch); x=await tx(db_session,test_user)
    assert (await post(async_client,evt(x,merchant_reference_id=""))).json()["reason"]=="missing_merchant_reference_id"
    assert (await post(async_client,evt(x,merchant_reference_id="BM-RAPYD-not-ours"))).json()["reason"]=="payment_not_found"
    await db_session.refresh(x); assert x.paid_at is None and x.provider_payment_id is None

@pytest.mark.asyncio
async def test_payment_succeeded_never_settles(async_client,db_session,test_user,monkeypatch):
    cfg(monkeypatch); x=await tx(db_session,test_user); p=evt(x); p["type"]="PAYMENT_SUCCEEDED"; p["data"]["status"]="ACT"
    r=await post(async_client,p); assert r.json()["reason"]=="non_settlement_event"
    await db_session.refresh(x); assert x.paid_at is None
