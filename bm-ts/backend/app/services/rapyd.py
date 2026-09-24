"""Rapyd REST API provider foundation.

This module owns provider-specific transport concerns only:
- deterministic canonical JSON request serialization;
- Rapyd request authentication/signing;
- explicit connect/read timeout boundaries;
- provider response-envelope validation;
- safe provider failure classification.

Business checkout idempotency, durable checkout attempts, reconciliation,
settlement, entitlements, and user-facing errors remain in BirthdayMessaging.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from dataclasses import dataclass
from typing import Any, Mapping

import httpx

from app.core.config import settings


logger = logging.getLogger(__name__)


class RapydError(Exception):
    """Base exception for Rapyd provider failures."""


class RapydConfigurationError(RapydError):
    """Rapyd is not safely configured."""


class RapydTransportError(RapydError):
    """Rapyd could not be reached or the response could not be read."""


class RapydRateLimitError(RapydError):
    """Rapyd throttled the request."""

    def __init__(self, *, retry_after: float | None = None) -> None:
        super().__init__("Rapyd temporarily rate-limited the request.")
        self.retry_after = retry_after


class RapydProviderError(RapydError):
    """Rapyd returned an authenticated application/provider error."""

    def __init__(self, *, status_code: int, provider_code: str | None = None) -> None:
        super().__init__("Rapyd rejected the provider request.")
        self.status_code = status_code
        self.provider_code = provider_code


class RapydResponseError(RapydError):
    """Rapyd returned a malformed or inconsistent response."""


@dataclass(frozen=True)
class RapydRequest:
    method: str
    path: str
    body: str
    salt: str
    timestamp: str
    signature: str


def _require_config() -> None:
    base_url = settings.rapyd_base_url.strip()
    access_key = settings.rapyd_access_key.strip()
    secret_key = settings.rapyd_secret_key.strip()

    if not base_url.startswith("https://"):
        raise RapydConfigurationError("Rapyd API URL must use HTTPS.")
    if not access_key or not secret_key:
        raise RapydConfigurationError("Rapyd credentials are not configured.")


def canonical_json(payload: Mapping[str, Any] | None) -> str:
    """Serialize exactly the representation that will be signed and transmitted."""
    if payload is None:
        return ""
    return json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def sign_request(
    *,
    method: str,
    path: str,
    body: str,
    salt: str,
    timestamp: str,
    access_key: str,
    secret_key: str,
) -> str:
    """Create Rapyd's base64-encoded HMAC-SHA256 request signature."""
    to_sign = (
        method.lower()
        + path
        + salt
        + timestamp
        + access_key
        + secret_key
        + body
    )
    digest = hmac.new(
        secret_key.encode("utf-8"),
        to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return base64.b64encode(digest.encode("ascii")).decode("ascii")


def build_request(
    *,
    method: str,
    path: str,
    payload: Mapping[str, Any] | None = None,
    salt: str | None = None,
    timestamp: int | None = None,
) -> RapydRequest:
    _require_config()

    if not path.startswith("/"):
        raise ValueError("Rapyd request path must begin with '/'.")

    body = canonical_json(payload)
    request_salt = salt or secrets.token_hex(8)
    request_timestamp = str(timestamp if timestamp is not None else int(time.time()))

    signature = sign_request(
        method=method,
        path=path,
        body=body,
        salt=request_salt,
        timestamp=request_timestamp,
        access_key=settings.rapyd_access_key,
        secret_key=settings.rapyd_secret_key,
    )

    return RapydRequest(
        method=method.upper(),
        path=path,
        body=body,
        salt=request_salt,
        timestamp=request_timestamp,
        signature=signature,
    )


def _retry_after(headers: httpx.Headers) -> float | None:
    value = headers.get("Retry-After")
    if value is None:
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def _provider_code(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    status = payload.get("status")
    if not isinstance(status, dict):
        return None
    code = status.get("error_code")
    return str(code) if code else None


async def request(
    *,
    method: str,
    path: str,
    payload: Mapping[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Execute one signed Rapyd request.

    This function intentionally performs no automatic retries. For financial
    POSTs a timeout or 5xx may represent an accepted-but-unobserved operation.
    The checkout orchestration/reconciliation layer decides what is safe.
    """
    signed = build_request(method=method, path=path, payload=payload)

    headers = {
        "access_key": settings.rapyd_access_key,
        "salt": signed.salt,
        "timestamp": signed.timestamp,
        "signature": signed.signature,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if idempotency_key:
        headers["idempotency"] = idempotency_key

    timeout = httpx.Timeout(
        connect=settings.rapyd_connect_timeout_seconds,
        read=settings.rapyd_read_timeout_seconds,
        write=settings.rapyd_read_timeout_seconds,
        pool=settings.rapyd_connect_timeout_seconds,
    )

    try:
        async with httpx.AsyncClient(
            base_url=settings.rapyd_base_url.rstrip("/"),
            timeout=timeout,
        ) as client:
            response = await client.request(
                signed.method,
                signed.path,
                content=signed.body.encode("utf-8") if signed.body else None,
                headers=headers,
            )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        logger.warning(
            "rapyd_transport_uncertain",
            extra={"event": "rapyd_transport_uncertain", "path": path},
        )
        raise RapydTransportError("Rapyd request outcome is uncertain.") from exc

    if response.status_code == 429:
        raise RapydRateLimitError(retry_after=_retry_after(response.headers))

    try:
        data = response.json()
    except ValueError as exc:
        raise RapydResponseError("Rapyd returned invalid JSON.") from exc

    if not isinstance(data, dict):
        raise RapydResponseError("Rapyd returned an invalid response envelope.")

    if response.status_code >= 500:
        raise RapydTransportError("Rapyd returned a temporary provider failure.")

    provider_status = data.get("status")
    provider_success = (
        isinstance(provider_status, dict)
        and str(provider_status.get("status") or "").upper() == "SUCCESS"
    )

    if response.status_code >= 400 or not provider_success:
        raise RapydProviderError(
            status_code=response.status_code,
            provider_code=_provider_code(data),
        )

    response_data = data.get("data")
    if not isinstance(response_data, dict):
        raise RapydResponseError("Rapyd response is missing the data object.")

    return response_data
async def create_hosted_checkout(
    *,
    amount: Any,
    currency: str,
    merchant_reference_id: str,
    idempotency_key: str,
    country: str = "US",
    description: str | None = None,
) -> dict[str, Any]:
    """Create one Hosted Checkout without automatic financial retries."""
    normalized_country = str(country).strip().upper()
    if len(normalized_country) != 2 or not normalized_country.isalpha():
        raise RapydConfigurationError("Rapyd checkout country must be a two-letter ISO country code.")

    payload: dict[str, Any] = {
        "amount": float(amount),
        "country": normalized_country,
        "currency": str(currency).upper(),
        "merchant_reference_id": merchant_reference_id,
    }
    if description:
        payload["description"] = description
    return await request(
        method="POST",
        path="/v1/checkout",
        payload=payload,
        idempotency_key=idempotency_key,
    )
class RapydWebhookAuthenticationError(RapydError):
    """Raised when a Rapyd webhook cannot be authenticated safely."""


class RapydWebhookPayloadError(RapydError):
    """Raised when a Rapyd webhook body is not a valid JSON object."""


def _webhook_body_candidates(raw_body: bytes) -> tuple[dict[str, Any], tuple[str, ...]]:
    try:
        raw_text = raw_body.decode("utf-8")
        parsed = json.loads(raw_text)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RapydWebhookPayloadError("Invalid Rapyd webhook JSON.") from exc
    if not isinstance(parsed, dict):
        raise RapydWebhookPayloadError("Rapyd webhook body must be a JSON object.")
    compact = json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))
    candidates = (raw_text,) if compact == raw_text else (raw_text, compact)
    return parsed, candidates


def _rapyd_webhook_signature(
    *,
    body_string: str,
    salt: str,
    timestamp: str,
    webhook_url: str,
    access_key: str,
    secret_key: str,
) -> str:
    to_sign = webhook_url + salt + timestamp + access_key + secret_key + body_string
    digest_hex = hmac.new(
        secret_key.encode("utf-8"),
        to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return base64.urlsafe_b64encode(digest_hex.encode("utf-8")).decode("ascii")


def verify_webhook_signature(
    *,
    raw_body: bytes,
    salt: str,
    timestamp: str,
    signature: str,
    now: int | None = None,
) -> dict[str, Any]:
    """Authenticate one Rapyd webhook before any DB or business operation."""
    webhook_url = settings.rapyd_webhook_url.strip()
    access_key = settings.rapyd_access_key.strip()
    secret_key = settings.rapyd_secret_key.strip()
    if not webhook_url or not access_key or not secret_key:
        raise RapydConfigurationError("Rapyd webhook authentication is not configured.")
    if not webhook_url.startswith("https://"):
        raise RapydConfigurationError("RAPYD_WEBHOOK_URL must use HTTPS.")
    if not salt or not timestamp or not signature:
        raise RapydWebhookAuthenticationError("Missing Rapyd webhook authentication headers.")
    try:
        sent_at = int(timestamp)
    except (TypeError, ValueError) as exc:
        raise RapydWebhookAuthenticationError("Invalid Rapyd webhook timestamp.") from exc
    current = int(time.time()) if now is None else int(now)
    age = current - sent_at
    if age > settings.rapyd_webhook_max_age_seconds:
        raise RapydWebhookAuthenticationError("Rapyd webhook timestamp is stale.")
    if age < -settings.rapyd_webhook_max_future_seconds:
        raise RapydWebhookAuthenticationError("Rapyd webhook timestamp is in the future.")
    event, candidates = _webhook_body_candidates(raw_body)
    for body_string in candidates:
        expected = _rapyd_webhook_signature(
            body_string=body_string,
            salt=salt,
            timestamp=timestamp,
            webhook_url=webhook_url,
            access_key=access_key,
            secret_key=secret_key,
        )
        if hmac.compare_digest(expected, signature):
            return event
    raise RapydWebhookAuthenticationError("Invalid Rapyd webhook signature.")

async def retrieve_checkout(checkout_id: str) -> dict[str, Any]:
    """Retrieve one existing Rapyd Hosted Checkout without creating or mutating it."""
    normalized = str(checkout_id or "").strip()
    if not normalized.startswith("checkout_"):
        raise ValueError("Rapyd checkout id must begin with 'checkout_'.")
    return await request(method="GET", path=f"/v1/checkout/{normalized}")


async def retrieve_payment(payment_id: str) -> dict[str, Any]:
    """Retrieve one existing Rapyd payment without creating or mutating it."""
    normalized = str(payment_id or "").strip()
    if not normalized.startswith("payment_"):
        raise ValueError("Rapyd payment id must begin with 'payment_'.")
    return await request(method="GET", path=f"/v1/payments/{normalized}")
