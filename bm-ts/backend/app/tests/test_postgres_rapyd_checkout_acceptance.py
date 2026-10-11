"""Real PostgreSQL + HTTP acceptance tests for BirthdayMessaging Rapyd checkout.

These tests use PostgreSQL because the durable idempotency boundary depends on
real unique constraints and concurrent commits. Rapyd itself is replaced by a
deterministic in-process fake; no external Rapyd call is made.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_current_user
from app.api.routers import payments
from app.db.models import PaymentCheckoutAttempt, PaymentTransaction, User
from app.db.session import get_db
from app.main import app
from app.services import rapyd


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
            base_url="http://rapyd-checkout-acceptance.test",
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


class FakeRapyd:
    def __init__(self):
        self.create_calls = 0
        self.delay_seconds = 0.0
        self.mode = "success"
        self.last_kwargs: dict | None = None

    async def create_hosted_checkout(self, **kwargs):
        self.create_calls += 1
        self.last_kwargs = dict(kwargs)

        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)

        if self.mode == "transport":
            raise rapyd.RapydTransportError("simulated uncertain transport failure")
        if self.mode == "rate_limit":
            raise rapyd.RapydRateLimitError(retry_after=7)
        if self.mode == "provider_reject":
            raise rapyd.RapydProviderError(
                status_code=400,
                provider_code="SIMULATED_REJECTION",
            )
        if self.mode == "configuration":
            raise rapyd.RapydConfigurationError("simulated configuration failure")

        return {
            "id": f"checkout_{uuid.uuid4().hex}",
            "redirect_url": f"https://checkout.example.test/{uuid.uuid4().hex}",
            "status": "NEW",
        }


def _install_fake(monkeypatch, fake: FakeRapyd) -> None:
    monkeypatch.setattr(payments, "create_hosted_checkout", fake.create_hosted_checkout)


async def _counts(factory, user_id):
    async with factory() as db:
        attempt_count = await db.scalar(
            select(func.count())
            .select_from(PaymentCheckoutAttempt)
            .where(
                PaymentCheckoutAttempt.user_id == user_id,
                PaymentCheckoutAttempt.provider == "rapyd",
            )
        )
        transaction_count = await db.scalar(
            select(func.count())
            .select_from(PaymentTransaction)
            .where(
                PaymentTransaction.user_id == user_id,
                PaymentTransaction.provider == "rapyd",
            )
        )
        return int(attempt_count or 0), int(transaction_count or 0)


async def _latest_attempt(factory, user_id) -> PaymentCheckoutAttempt:
    async with factory() as db:
        result = await db.execute(
            select(PaymentCheckoutAttempt)
            .where(
                PaymentCheckoutAttempt.user_id == user_id,
                PaymentCheckoutAttempt.provider == "rapyd",
            )
            .order_by(PaymentCheckoutAttempt.created_at.desc())
        )
        attempt = result.scalars().first()
        assert attempt is not None
        return attempt


@pytest.mark.asyncio
async def test_same_key_concurrent_requests_create_one_provider_checkout(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="rapyd-same-key")
    fake = FakeRapyd()
    fake.delay_seconds = 0.20
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        async def request():
            return await client.post(
                "/api/payments/rapyd/checkout",
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
            "/api/payments/rapyd/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": key},
        )
        assert retry.status_code == 200, retry.text
        assert retry.json()["reused"] is True

    assert fake.create_calls == 1
    assert await _counts(pg_session_factory, user.id) == (1, 1)


@pytest.mark.asyncio
async def test_same_key_replay_returns_exact_existing_checkout(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="rapyd-replay")
    fake = FakeRapyd()
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        first = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "quarterly"},
            headers={"Idempotency-Key": key},
        )
        second = await client.post(
            "/api/payments/rapyd/checkout",
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
    user = await _create_user(pg_session_factory, label="rapyd-conflict")
    fake = FakeRapyd()
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        first = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": key},
        )
        conflict = await client.post(
            "/api/payments/rapyd/checkout",
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
    first_user = await _create_user(pg_session_factory, label="rapyd-scope-a")
    second_user = await _create_user(pg_session_factory, label="rapyd-scope-b")
    fake = FakeRapyd()
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, first_user) as client:
        a = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "semiannual"},
            headers={"Idempotency-Key": key},
        )

    async with _client_for_user(pg_session_factory, second_user) as client:
        b = await client.post(
            "/api/payments/rapyd/checkout",
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
    user = await _create_user(pg_session_factory, label="rapyd-different-keys")
    fake = FakeRapyd()
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        first = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )
        second = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["payment_id"] != second.json()["payment_id"]
    assert fake.create_calls == 2
    assert await _counts(pg_session_factory, user.id) == (2, 2)


@pytest.mark.asyncio
async def test_transport_ambiguity_never_creates_second_checkout(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="rapyd-transport")
    fake = FakeRapyd()
    fake.mode = "transport"
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        uncertain = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "yearly"},
            headers={"Idempotency-Key": key},
        )
        assert uncertain.status_code == 503, uncertain.text
        assert uncertain.json()["code"] == "payment_provider_uncertain"

        retry = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "yearly"},
            headers={"Idempotency-Key": key},
        )

    assert retry.status_code == 409, retry.text
    assert retry.json()["code"] == "payment_checkout_in_progress"
    assert fake.create_calls == 1
    assert await _counts(pg_session_factory, user.id) == (1, 0)
    attempt = await _latest_attempt(pg_session_factory, user.id)
    assert attempt.status == "uncertain"
    assert attempt.failure_code == "provider_create_uncertain"


@pytest.mark.asyncio
async def test_rate_limit_marks_uncertain_respects_retry_after_and_does_not_retry(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="rapyd-rate-limit")
    fake = FakeRapyd()
    fake.mode = "rate_limit"
    _install_fake(monkeypatch, fake)
    key = str(uuid.uuid4())

    async with _client_for_user(pg_session_factory, user) as client:
        limited = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": key},
        )
        assert limited.status_code == 503, limited.text
        assert limited.json()["code"] == "payment_provider_uncertain"
        assert limited.headers.get("Retry-After") == "7"

        retry = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": key},
        )

    assert retry.status_code == 409, retry.text
    assert fake.create_calls == 1
    assert await _counts(pg_session_factory, user.id) == (1, 0)
    attempt = await _latest_attempt(pg_session_factory, user.id)
    assert attempt.status == "uncertain"
    assert attempt.failure_code == "provider_rate_limited"


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
    user = await _create_user(pg_session_factory, label=f"rapyd-catalog-{plan_code}")
    fake = FakeRapyd()
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        response = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": plan_code},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert Decimal(str(body["amount"])) == Decimal(expected_amount)
    assert body["currency"] == "USD"
    assert body["plan_code"] == plan_code
    assert body["billing_term_months"] == expected_months
    assert fake.last_kwargs is not None
    assert Decimal(str(fake.last_kwargs["amount"])) == Decimal(expected_amount)
    assert fake.last_kwargs["currency"] == "USD"


@pytest.mark.asyncio
async def test_missing_and_invalid_idempotency_keys_are_rejected_before_provider_call(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="rapyd-bad-key")
    fake = FakeRapyd()
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        missing = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "monthly"},
        )
        invalid = await client.post(
            "/api/payments/rapyd/checkout",
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
    user = await _create_user(pg_session_factory, label="rapyd-bad-plan")
    fake = FakeRapyd()
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        response = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "lifetime"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )

    assert response.status_code == 400, response.text
    assert fake.create_calls == 0
    assert await _counts(pg_session_factory, user.id) == (0, 0)


@pytest.mark.asyncio
async def test_deterministic_provider_rejection_is_failed_not_uncertain(
    pg_session_factory,
    monkeypatch,
):
    user = await _create_user(pg_session_factory, label="rapyd-reject")
    fake = FakeRapyd()
    fake.mode = "provider_reject"
    _install_fake(monkeypatch, fake)

    async with _client_for_user(pg_session_factory, user) as client:
        response = await client.post(
            "/api/payments/rapyd/checkout",
            json={"plan_code": "monthly"},
            headers={"Idempotency-Key": str(uuid.uuid4())},
        )

    assert response.status_code == 502, response.text
    assert fake.create_calls == 1
    assert await _counts(pg_session_factory, user.id) == (1, 0)
    attempt = await _latest_attempt(pg_session_factory, user.id)
    assert attempt.status == "failed"
    assert attempt.failure_code == "provider_rejected"
