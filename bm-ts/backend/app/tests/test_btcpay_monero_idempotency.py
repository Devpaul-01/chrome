from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.db.session import get_db
from app.main import app


@pytest.mark.asyncio
async def test_same_idempotency_key_cannot_switch_payment_method(
    db_session,
    test_user,
    monkeypatch,
):
    from app.api.routers import payments

    async def override_db():
        yield db_session

    async def override_current_user():
        return test_user

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_current_user

    calls = []

    async def fake_create_invoice(**kwargs):
        calls.append(kwargs)
        return {
            "id": f"invoice-{len(calls)}",
            "checkoutLink": f"https://btcpay.test/i/{len(calls)}",
            "status": "New",
        }

    monkeypatch.setattr(payments, "create_invoice", fake_create_invoice)

    key = f"xmr-rail-isolation-{uuid4()}"

    try:
        transport = ASGITransport(app=app)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            first = await client.post(
                "/api/payments/btcpay/checkout",
                headers={"Idempotency-Key": key},
                json={
                    "plan_code": "monthly",
                    "payment_method": "bitcoin",
                },
            )

            assert first.status_code in (200, 201), first.text

            second = await client.post(
                "/api/payments/btcpay/checkout",
                headers={"Idempotency-Key": key},
                json={
                    "plan_code": "monthly",
                    "payment_method": "monero",
                },
            )

        assert second.status_code == 409, second.text
        assert len(calls) == 1
        assert calls[0]["payment_method"] == "bitcoin"

    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)
