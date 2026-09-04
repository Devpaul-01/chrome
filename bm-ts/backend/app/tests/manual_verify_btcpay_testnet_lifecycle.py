from __future__ import annotations
import argparse, asyncio, json
from sqlalchemy import text
from app.db.session import AsyncSessionLocal

async def rows(db, sql, params):
    return [dict(r) for r in (await db.execute(text(sql), params)).mappings().all()]

async def table_exists(db, name):
    return bool(await db.scalar(text("""
        select exists(
          select 1 from information_schema.tables
          where table_schema='public' and table_name=:name
        )
    """), {"name": name}))

async def columns(db, table):
    return set((await db.execute(text("""
      select column_name from information_schema.columns
      where table_schema='public' and table_name=:t
    """), {"t":table})).scalars().all())

async def main():
    p=argparse.ArgumentParser()
    p.add_argument("--payment-id", required=True)
    p.add_argument("--provider-payment-id", required=True)
    a=p.parse_args()
    out={}
    async with AsyncSessionLocal() as db:
        tx = await rows(db, "select * from payment_transactions where id=:id", {"id":a.payment_id})
        out["payment_transactions"]=tx
        out["payment_transaction_count_for_provider_id"]=int(await db.scalar(
            text("select count(*) from payment_transactions where provider_payment_id=:p"), {"p":a.provider_payment_id}
        ) or 0)

        if await table_exists(db,"access_entitlements"):
            c=await columns(db,"access_entitlements")
            if "source_payment_id" in c:
                ent=await rows(db,"select * from access_entitlements where source_provider=:provider and source_payment_id=:provider_payment_id and source_transaction_id=:payment_id", {"provider":"btcpay","provider_payment_id":a.provider_payment_id,"payment_id":a.payment_id})
            else:
                ent=[]
            out["access_entitlements"]=ent
            out["entitlement_count"]=len(ent)

        if await table_exists(db,"payment_webhook_events"):
            c=await columns(db,"payment_webhook_events")
            candidates=[]
            for name in ("payload","payload_json","event_payload","raw_payload"):
                if name in c:
                    candidates.append(f"cast({name} as text) like '%' || :p || '%'")
            if "provider_payment_id" in c:
                candidates.append("provider_payment_id=:p")
            if candidates:
                q="select * from payment_webhook_events where " + " or ".join(candidates)
                ev=await rows(db,q,{"p":a.provider_payment_id})
            else:
                ev=[]
            out["payment_webhook_events"]=ev

        if await table_exists(db,"notification_outbox"):
            c=await columns(db,"notification_outbox")
            clauses=[]
            params={"payment_id":a.payment_id}
            if "source_transaction_id" in c:
                clauses.append("source_transaction_id=:payment_id")
            ent_id = None
            if out.get("access_entitlements"):
                ent_id=str(out["access_entitlements"][0].get("id"))
            if ent_id and "entitlement_id" in c:
                clauses.append("entitlement_id=:entitlement_id")
                params["entitlement_id"]=ent_id
            if clauses:
                out["notification_outbox"]=await rows(db,"select * from notification_outbox where "+" or ".join(clauses),params)
            else:
                out["notification_outbox"]=[]

    print(json.dumps(out,indent=2,default=str))

asyncio.run(main())
