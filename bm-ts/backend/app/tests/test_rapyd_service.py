from types import SimpleNamespace

import httpx
import pytest

from app.services import rapyd


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(
        rapyd,
        "settings",
        SimpleNamespace(
            rapyd_base_url="https://sandboxapi.rapyd.net",
            rapyd_access_key="access-key-test",
            rapyd_secret_key="secret-key-test",
            rapyd_connect_timeout_seconds=5.0,
            rapyd_read_timeout_seconds=20.0,
        ),
    )


def test_canonical_json_is_deterministic():
    assert rapyd.canonical_json({"z": 1, "a": "x"}) == '{"a":"x","z":1}'


def test_build_request_is_deterministic_with_fixed_salt_and_timestamp(configured):
    one = rapyd.build_request(
        method="POST",
        path="/v1/checkout",
        payload={"amount": 10, "currency": "USD"},
        salt="fixedsalt",
        timestamp=1700000000,
    )
    two = rapyd.build_request(
        method="POST",
        path="/v1/checkout",
        payload={"currency": "USD", "amount": 10},
        salt="fixedsalt",
        timestamp=1700000000,
    )
    assert one.body == two.body
    assert one.signature == two.signature
    assert one.signature


def test_configuration_fails_closed_without_credentials(monkeypatch):
    monkeypatch.setattr(
        rapyd,
        "settings",
        SimpleNamespace(
            rapyd_base_url="https://sandboxapi.rapyd.net",
            rapyd_access_key="",
            rapyd_secret_key="",
        ),
    )
    with pytest.raises(rapyd.RapydConfigurationError):
        rapyd.build_request(method="GET", path="/v1/test")


def test_configuration_rejects_non_https(monkeypatch):
    monkeypatch.setattr(
        rapyd,
        "settings",
        SimpleNamespace(
            rapyd_base_url="http://sandboxapi.rapyd.net",
            rapyd_access_key="access",
            rapyd_secret_key="secret",
        ),
    )
    with pytest.raises(rapyd.RapydConfigurationError):
        rapyd.build_request(method="GET", path="/v1/test")


def test_retry_after_numeric_seconds():
    assert rapyd._retry_after(httpx.Headers({"Retry-After": "7"})) == 7.0
    assert rapyd._retry_after(httpx.Headers({"Retry-After": "bad"})) is None


@pytest.mark.asyncio
async def test_429_is_classified_without_automatic_retry(configured, monkeypatch):
    calls = 0

    async def fake_request(self, *args, **kwargs):
        nonlocal calls
        calls += 1
        return httpx.Response(
            429,
            headers={"Retry-After": "9"},
            json={"status": {"status": "ERROR", "error_code": "RATE_LIMIT"}},
        )

    monkeypatch.setattr(httpx.AsyncClient, "request", fake_request)

    with pytest.raises(rapyd.RapydRateLimitError) as exc:
        await rapyd.request(
            method="POST",
            path="/v1/checkout",
            payload={"amount": 10},
            idempotency_key="birthdaymessaging-idempotency",
        )

    assert calls == 1
    assert exc.value.retry_after == 9.0


@pytest.mark.asyncio
async def test_5xx_is_uncertain_and_not_retried_here(configured, monkeypatch):
    calls = 0

    async def fake_request(self, *args, **kwargs):
        nonlocal calls
        calls += 1
        return httpx.Response(
            503,
            json={"status": {"status": "ERROR", "error_code": "SERVICE_UNAVAILABLE"}},
        )

    monkeypatch.setattr(httpx.AsyncClient, "request", fake_request)

    with pytest.raises(rapyd.RapydTransportError):
        await rapyd.request(
            method="POST",
            path="/v1/checkout",
            payload={"amount": 10},
        )

    assert calls == 1


@pytest.mark.asyncio
async def test_success_returns_only_provider_data(configured, monkeypatch):
    async def fake_request(self, *args, **kwargs):
        return httpx.Response(
            200,
            json={
                "status": {"status": "SUCCESS"},
                "data": {"id": "checkout_test", "redirect_url": "https://example.test"},
            },
        )

    monkeypatch.setattr(httpx.AsyncClient, "request", fake_request)

    result = await rapyd.request(method="GET", path="/v1/test")
    assert result["id"] == "checkout_test"


@pytest.mark.asyncio
async def test_provider_error_exposes_code_not_response_body(configured, monkeypatch):
    async def fake_request(self, *args, **kwargs):
        return httpx.Response(
            400,
            json={
                "status": {
                    "status": "ERROR",
                    "error_code": "SOME_PROVIDER_ERROR",
                    "message": "provider-internal-detail",
                }
            },
        )

    monkeypatch.setattr(httpx.AsyncClient, "request", fake_request)

    with pytest.raises(rapyd.RapydProviderError) as exc:
        await rapyd.request(method="GET", path="/v1/test")

    assert exc.value.provider_code == "SOME_PROVIDER_ERROR"
    assert "provider-internal-detail" not in str(exc.value)
