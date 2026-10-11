from datetime import datetime, timezone

import pytest

from app.services.entitlements import _add_term_days


@pytest.mark.parametrize(
    ("months", "expected_days"),
    [
        (1, 30),
        (3, 90),
        (6, 180),
        (12, 360),
    ],
)
def test_paid_terms_use_exactly_thirty_days_per_month(months, expected_days):
    start = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)

    end = _add_term_days(start, months)

    assert (end - start).days == expected_days


def test_monthly_term_does_not_follow_calendar_month_boundary():
    start = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)

    end = _add_term_days(start, 1)

    assert end == datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)


def test_yearly_term_is_exactly_360_days():
    start = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)

    end = _add_term_days(start, 12)

    assert end == datetime(2027, 10, 14, 12, 0, tzinfo=timezone.utc)
