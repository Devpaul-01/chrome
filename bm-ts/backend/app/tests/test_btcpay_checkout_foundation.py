from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routers.payments import _validate_idempotency_key
from app.core.errors import AppError, ErrorCodes
from app.services import btcpay


def test_checkout_requires_idempotency_key():
    with pytest.raises(AppError) as exc:
        _validate_idempotency_key(None)

    assert exc.value.status_code == 400
    assert exc.value.code == ErrorCodes.PAYMENT_IDEMPOTENCY_REQUIRED


@pytest.mark.parametrize("value", ["short", "bad key with spaces", "x" * 129])
def test_checkout_rejects_invalid_idempotency_keys(value):
    with pytest.raises(AppError) as exc:
        _validate_idempotency_key(value)

    assert exc.value.status_code == 400
    assert exc.value.code == ErrorCodes.PAYMENT_IDEMPOTENCY_INVALID


def test_checkout_accepts_uuid_style_idempotency_key():
    key = str(uuid4())
    assert _validate_idempotency_key(key) == key


def test_btcpay_order_reconciliation_filters_exact_metadata_match(monkeypatch):
    expected = {
        "id": "invoice-exact",
        "checkoutLink": "https://example.test/i/invoice-exact",
        "metadata": {"orderId": "BM-order-123"},
    }

    class Response:
        ok = True
        status_code = 200

        def json(self):
            return [
                {"id": "fuzzy", "metadata": {"orderId": "BM-order-123-extra"}},
                expected,
            ]

    monkeypatch.setattr(
        btcpay,
        "settings",
        SimpleNamespace(
            btcpay_url="https://btcpay.test",
            btcpay_store_id="store",
            btcpay_api_key="secret",
        ),
    )
    monkeypatch.setattr(btcpay.requests, "get", lambda *args, **kwargs: Response())

    actual = btcpay._find_invoice_by_order_id_sync("BM-order-123")

    assert actual == expected


def test_btcpay_order_reconciliation_returns_none_when_absent(monkeypatch):
    class Response:
        ok = True
        status_code = 200

        def json(self):
            return []

    monkeypatch.setattr(
        btcpay,
        "settings",
        SimpleNamespace(
            btcpay_url="https://btcpay.test",
            btcpay_store_id="store",
            btcpay_api_key="secret",
        ),
    )
    monkeypatch.setattr(btcpay.requests, "get", lambda *args, **kwargs: Response())

    assert btcpay._find_invoice_by_order_id_sync("BM-missing") is None


def test_btcpay_order_reconciliation_rejects_ambiguous_exact_matches(monkeypatch):
    class Response:
        ok = True
        status_code = 200

        def json(self):
            return [
                {"id": "one", "metadata": {"orderId": "BM-dup"}},
                {"id": "two", "metadata": {"orderId": "BM-dup"}},
            ]

    monkeypatch.setattr(
        btcpay,
        "settings",
        SimpleNamespace(
            btcpay_url="https://btcpay.test",
            btcpay_store_id="store",
            btcpay_api_key="secret",
        ),
    )
    monkeypatch.setattr(btcpay.requests, "get", lambda *args, **kwargs: Response())

    with pytest.raises(HTTPException) as exc:
        btcpay._find_invoice_by_order_id_sync("BM-dup")

    assert exc.value.status_code == 502


def test_public_checkout_url_rewrites_internal_provider_origin(monkeypatch):
    from app.services import btcpay
    monkeypatch.setattr(
        btcpay.settings,
        "btcpay_public_url",
        "https://btcpay.example.test",
    )
    result = btcpay.public_checkout_url(
        "https://bm-btcpay-xmr-stagenet:49393/i/invoice-123?paymentMethod=XMR-CHAIN"
    )
    assert result == (
        "https://btcpay.example.test/i/invoice-123?paymentMethod=XMR-CHAIN"
    )
    assert "bm-btcpay-xmr-stagenet" not in result


def test_public_checkout_url_preserves_provider_path(monkeypatch):
    from app.services import btcpay
    monkeypatch.setattr(
        btcpay.settings,
        "btcpay_public_url",
        "https://btcpay.example.test",
    )
    assert btcpay.public_checkout_url(
        "https://provider.internal/custom/checkout/abc"
    ) == "https://btcpay.example.test/custom/checkout/abc"
