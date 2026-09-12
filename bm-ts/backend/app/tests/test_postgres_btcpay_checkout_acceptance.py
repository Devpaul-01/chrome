"""Real PostgreSQL + HTTP acceptance tests for production BTCPay checkout.

These tests deliberately use PostgreSQL rather than SQLite because the checkout
idempotency boundary depends on real unique constraints and concurrent commits.
BTCPay itself is replaced with a deterministic in-process fake so the tests can
prove our application guarantees without creating external invoices.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.api.deps import get_current_user
from app.api.routers import payments
from app.db.models import PaymentCheckoutAttempt, PaymentTransaction, User
from app.db.session import get_db
from app.main import app


DATABASE_URL = os.environ.get("CONCURRENCY_DATABASE_URL", "").strip()
pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="CONCURRENCY_DATABASE_URL is required for real PostgreSQL checkout tests.",
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture(scope="module")
def pg_engine():
    engine = create_async_engine(
        DATABASE_URL,
        poolclass=NullPool,
        future=True,
    )
    yield engine


@pytest.fixture
async def pg_session_factory(pg_engine):
    factory = async_sessionmaker(
        pg_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    yield factory


async def _create_user(factory, *, label: str) -> User:
    async with factory() as db:
        now = _utcnow()
        user = User(
            id=uuid.uuid4(),
            email=f"{label}-{uuid.uuid4().hex}@example.test",
            password_hash="not-used-by-checkout-acceptance",
            created_at=now,
            updated_at=now,
            failed_login_count=0,
            locked_until=None,
            email_verified=True,
            metadata_payload={},
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@asynccontextmanager
async def _client_for_user(factory, user: User):
    async def override_get_db():
        async with factory() as db:
            yield db

    async def override_current_user():
        return user

    old_db = app.dependency_overrides.get(get_db)
    old_user = app.dependency_overrides.get(get_current_user)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport,
            base_url="http://checkout-acceptance.test",
        ) as client:
            yield client
    finally:
        if old_db is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = old_db

        if old_user is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = old_user


@pytest.fixture(autouse=True)
def configured_plan_prices(monkeypatch):
    monkeypatch.setenv("BTCPAY_PRICE_MONTHLY", "10.00")
    monkeypatch.setenv("BTCPAY_PRICE_3_MONTH", "27.00")
    monkeypatch.setenv("BTCPAY_PRICE_6_MONTH", "50.00")
    monkeypatch.setenv("BTCPAY_PRICE_YEARLY", "90.00")
    monkeypatch.setenv("BTCPAY_CURRENCY", "USD")


class FakeBTCPay:
    def __init__(self):
        self.create_calls = 0
        self.by_order: dict[str, dict] = {}
        self.delay_seconds = 0.0
        self.fail_after_accept_once = False
        self._failed_once = False

    async def create_invoice(
        self,
        *,
        amount,
        currency,
        order_id,
        description,
        user_id,
        buyer_email,
        payment_method="bitcoin",
    ):
        self.create_calls += 1

        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)

        invoice = {
            "id": f"invoice-{uuid.uuid4().hex}",
            "checkoutLink": f"https://checkout.example.test/{uuid.uuid4().hex}",
            "status": "New",
            "metadata": {
                "orderId": order_id,
                "userId": user_id,
            },
        }
        self.by_order[order_id] = invoice

        if self.fail_after_accept_once and not self._failed_once:
            self._failed_once = True
            raise HTTPException(
                status_code=502,
                detail="simulated lost provider response",
            )

        return invoice

    async def find_invoice_by_order_id(self, order_id: str):
        return self.by_order.get(order_id)


def _install_fake(monkeypatch, fake: FakeBTCPay) -> None:
    monkeypatch.setattr(payments, "create_invoice", fake.create_invoice)
    monkeypatch.setattr(
        payments,
        "find_invoice_by_order_id",
        fake.find_invoice_by_order_id,
    )


async def _counts(factory, user_id):
    async with factory() as db:
        attempt_count = await db.scalar(
            select(func.count())
            .select_from(PaymentCheckoutAttempt)
            .where(PaymentCheckoutAttempt.user_id == user_id)
        )
        transaction_count = await db.scalar(
            select(func.count())
            .select_from(PaymentTransaction)
            .where(
                PaymentTransaction.user_id == user_id,
                PaymentTransaction.provider == "btcpay",
            )
        )
        return int(attempt_count or 0), int(transaction_count or 0)


@pytest.mark.asyncio
async def test_same_key_concurrent_requests_create_one_provider_invoice(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="same-key")
    fake = FakeBTCPay()
    fake.delay_seconds = 0.20
    _install_fake(monkeypatch, fake)

    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        async def request():
            return await client.post(
                "/api/payments/btcpay/checkout",
                json={"plan_code": "monthly"},
                headers={"Idempotency-Key": key},
            )

        first, second = await asyncio.gather(request(), request())

        statuses = sorted([first.status_code, second.status_code])
        assert statuses in ([201, 409], [200, 201]), (
            first.status_code,
            first.text,
            second.status_code,
            second.text,
        )

        retry = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": key},
        )
        assert retry.status_code == 200, retry.text

    assert fake.create_calls == 1
    assert await _counts(pg_session_factory, user.id) == (1, 1)


@pytest.mark.asyncio
async def test_same_key_replay_returns_exact_existing_checkout(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="replay")
    fake = FakeBTCPay()
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        first = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "quarterly"},
            headers={"Idempotency-Key": key},
        )
        second = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "quarterly"},
            headers={"Idempotency-Key": key},
        )

    assert first.status_code == 201, first.text
    assert second.status_code == 200, second.text
    assert first.json()["payment_id"] == second.json()["payment_id"]
    assert first.json()["provider_payment_id"] == second.json()["provider_payment_id"]
    assert second.json()["reused"] is True
    assert fake.create_calls == 1
    assert await _counts(pg_session_factory, user.id) == (1, 1)


@pytest.mark.asyncio
async def test_same_key_cannot_be_reused_for_different_plan(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="conflict")
    fake = FakeBTCPay()
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        first = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": key},
        )
        conflict = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "yearly"},
            headers={"Idempotency-Key": key},
        )

    assert first.status_code == 201, first.text
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["code"] == "payment_idempotency_conflict"
    assert fake.create_calls == 1
    assert await _counts(pg_session_factory, user.id) == (1, 1)


@pytest.mark.asyncio
async def test_same_key_is_scoped_per_user(
    pg_session_factory,
    monkeypatch,
):
    first_user = await _create_user(pg_session_factory, label="scope-a")
    second_user = await _create_user(pg_session_factory, label="scope-b")
    fake = FakeBTCPay()
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, first_user) as client:
        a = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "semiannual"},
            headers={"Idempotency-Key": key},
        )

    async with _client_for_user(pg_session_factory, second_user) as client:
        b = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "semiannual"},
            headers={"Idempotency-Key": key},
        )

    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text
    assert a.json()["payment_id"] != b.json()["payment_id"]
    assert fake.create_calls == 2
    assert await _counts(pg_session_factory, first_user.id) == (1, 1)
    assert await _counts(pg_session_factory, second_user.id) == (1, 1)


@pytest.mark.asyncio
async def test_different_keys_same_user_create_distinct_checkouts(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="different-keys")
    fake = FakeBTCPay()
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        first = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        second = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["payment_id"] != second.json()["payment_id"]
    assert fake.create_calls == 2
    assert await _counts(pg_session_factory, user.id) == (2, 2)


@pytest.mark.asyncio
async def test_lost_provider_response_is_reconciled_without_second_invoice(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="crash-window")
    fake = FakeBTCPay()
    fake.fail_after_accept_once = True
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        uncertain = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "yearly"},
            headers={"Idempotency-Key": key},
        )
        assert uncertain.status_code == 503, uncertain.text
        assert uncertain.json()["code"] == "payment_provider_uncertain"

        recovered = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "yearly"},
            headers={"Idempotency-Key": key},
        )

    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["reused"] is True
    assert recovered.json()["billing_term_months"] == 12
    assert fake.create_calls == 1
    assert await _counts(pg_session_factory, user.id) == (1, 1)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plan_code", "expected_amount", "expected_months"),
    [
        ("monthly", "10.00", 1),
        ("quarterly", "27.00", 3),
        ("semiannual", "50.00", 6),
        ("yearly", "90.00", 12),
    ],
)
async def test_http_checkout_uses_server_catalog_for_all_terms(
    pg_session_factory,
    monkeypatch,
    plan_code,
    expected_amount,
    expected_months,
):
    user = await _create_user(pg_session_factory, label=f"catalog-{plan_code}")
    fake = FakeBTCPay()
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        response = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": plan_code},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert Decimal(str(body["amount"])) == Decimal(expected_amount)
    assert body["currency"] == "USD"
    assert body["plan_code"] == plan_code
    assert body["billing_term_months"] == expected_months


@pytest.mark.asyncio
async def test_missing_and_invalid_idempotency_keys_are_rejected_before_provider_call(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="bad-key")
    fake = FakeBTCPay()
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        missing = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "monthly"},
        )
        invalid = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": "short"},
        )

    assert missing.status_code == 400, missing.text
    assert missing.json()["code"] == "payment_idempotency_required"
    assert invalid.status_code == 400, invalid.text
    assert invalid.json()["code"] == "payment_idempotency_invalid"
    assert fake.create_calls == 0
    assert await _counts(pg_session_factory, user.id) == (0, 0)


@pytest.mark.asyncio
async def test_unsupported_plan_is_rejected_before_provider_call(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="bad-plan")
    fake = FakeBTCPay()
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        response = await client.post(
            "/api/payments/btcpay/checkout",
            json={"plan_code": "lifetime"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )

    assert response.status_code == 400, response.text
    assert fake.create_calls == 0
    assert await _counts(pg_session_factory, user.id) == (0, 0)
