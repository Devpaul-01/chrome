from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest

from app.db.models import PaymentTransaction
from app.services.entitlements import _term_months


def _transaction(months):
    now = datetime.now(timezone.utc)
    return PaymentTransaction(
        id=uuid4(),
        user_id=uuid4(),
        provider="btcpay",
        provider_payment_id=f"invoice-{uuid4().hex}",
        provider_order_id=f"order-{uuid4().hex}",
        amount=Decimal("10.00"),
        currency="USD",
        status="Settled",
        checkout_url="https://example.test/checkout",
        payment_method="bitcoin",
        plan_code=f"term-{months}",
        paid_at=now,
        expires_at=None,
        created_at=now,
        updated_at=now,
        metadata_payload={"billing_term_months": months},
    )


@pytest.mark.parametrize("months", [1, 3, 6, 12])
def test_all_production_catalog_terms_are_entitlement_compatible(months):
    assert _term_months(_transaction(months)) == months


@pytest.mark.parametrize("months", [0, 2, 4, 5, 7, 13, 24])
def test_unsupported_entitlement_terms_still_fail_closed(months):
    with pytest.raises(ValueError):
        _term_months(_transaction(months))
