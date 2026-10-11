from __future__ import annotations

import argparse
import asyncio
import json
from sqlalchemy import text

from app.db.session import AsyncSessionLocal


async def table_exists(db, name: str) -> bool:
    q = text("""
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema='public' AND table_name=:name
        )
    """)
    return bool(await db.scalar(q, {"name": name}))


async def columns(db, table: str) -> set[str]:
    q = text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=:table
    """)
    rows = (await db.execute(q, {"table": table})).scalars().all()
    return set(rows)


async def scalar_count(db, sql: str, params: dict) -> int:
    return int((await db.scalar(text(sql), params)) or 0)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--payment-id", required=True)
    parser.add_argument("--provider-payment-id", required=True)
    args = parser.parse_args()

    out = {
        "payment_transaction": {},
        "webhook_events": {},
        "entitlement": {},
        "notification": {},
        "duplicates": {},
    }

    async with AsyncSessionLocal() as db:
        if await table_exists(db, "payment_transactions"):
            cols = await columns(db, "payment_transactions")
            fields = [c for c in (
                "id","user_id","provider","provider_payment_id","provider_order_id",
                "status","paid_at","plan_code","amount","currency","checkout_url"
            ) if c in cols]
            row = (await db.execute(
                text(f"SELECT {', '.join(fields)} FROM payment_transactions WHERE id=:id"),
                {"id": args.payment_id},
            )).mappings().first()
            out["payment_transaction"] = dict(row) if row else {}

            if "provider_payment_id" in cols:
                out["duplicates"]["payment_transactions_same_provider_payment_id"] = await scalar_count(
                    db,
                    "SELECT count(*) FROM payment_transactions WHERE provider_payment_id=:pid",
                    {"pid": args.provider_payment_id},
                )

        if await table_exists(db, "payment_webhook_events"):
            cols = await columns(db, "payment_webhook_events")
            candidate_filters = []
            params = {"pid": args.provider_payment_id}
            if "provider_payment_id" in cols:
                candidate_filters.append("provider_payment_id=:pid")
            if "payload" in cols:
                candidate_filters.append("CAST(payload AS TEXT) LIKE '%' || :pid || '%'")
            if "payload_json" in cols:
                candidate_filters.append("CAST(payload_json AS TEXT) LIKE '%' || :pid || '%'")
            if "event_payload" in cols:
                candidate_filters.append("CAST(event_payload AS TEXT) LIKE '%' || :pid || '%'")

            if candidate_filters:
                count = await scalar_count(
                    db,
                    "SELECT count(*) FROM payment_webhook_events WHERE " + " OR ".join(candidate_filters),
                    params,
                )
                out["webhook_events"]["matching_provider_payment_id"] = count
            else:
                out["webhook_events"]["note"] = "Could not identify a provider-payment lookup column dynamically."

        entitlement_id = None
        if await table_exists(db, "access_entitlements"):
            cols = await columns(db, "access_entitlements")
            if "source_payment_id" in cols:
                fields = [c for c in (
                    "id","user_id","plan_code","status","starts_at","expires_at",
                    "source_provider","source_payment_id"
                ) if c in cols]
                rows = (await db.execute(
                    text(f"SELECT {', '.join(fields)} FROM access_entitlements WHERE source_payment_id=:id"),
                    {"id": args.payment_id},
                )).mappings().all()
                out["entitlement"]["rows"] = [dict(r) for r in rows]
                out["duplicates"]["entitlements_for_payment"] = len(rows)
                if rows:
                    entitlement_id = str(rows[0].get("id"))

        if await table_exists(db, "notification_outbox"):
            cols = await columns(db, "notification_outbox")
            filters = []
            params = {"payment_id": args.payment_id, "entitlement_id": entitlement_id}
            if "source_transaction_id" in cols:
                filters.append("source_transaction_id=:payment_id")
            if entitlement_id and "entitlement_id" in cols:
                filters.append("entitlement_id=:entitlement_id")

            if filters:
                fields = [c for c in (
                    "id","user_id","entitlement_id","source_transaction_id",
                    "notification_type","channel","status","attempts","sent_at","last_error"
                ) if c in cols]
                rows = (await db.execute(
                    text(f"SELECT {', '.join(fields)} FROM notification_outbox WHERE " + " OR ".join(filters)),
                    params,
                )).mappings().all()
                out["notification"]["rows"] = [dict(r) for r in rows]
                out["notification"]["matching_rows"] = len(rows)
            else:
                out["notification"]["note"] = "Could not identify source linkage columns dynamically."

    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
