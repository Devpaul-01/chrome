"""
tests/test_db_constraints.py — Database constraint tests.

Covers: unique constraints, cascade deletes, enum enforcement via schemas.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.models import User, Contact


@pytest.mark.asyncio
async def test_duplicate_email_rejected(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    """Users table has a unique constraint on email."""
    user2 = User(
        email="testuser@example.com",  # Same as test_user fixture
        password_hash=hash_password("AnotherPass123!"),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        last_login_at=datetime.now(timezone.utc),
        failed_login_count=0,
        email_verified=False,
        metadata_payload={},
    )
    db_session.add(user2)
    with pytest.raises(Exception):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_schedule_unique_days_before(async_client: AsyncClient) -> None:
    """Each user can only have one schedule per days_before value."""
    await async_client.post("/api/schedules", json={"days_before": 1, "enabled": True})
    resp2 = await async_client.post(
        "/api/schedules", json={"days_before": 1, "enabled": True}
    )
    # Should fail with 400 or 409 (unique constraint)
    assert resp2.status_code in (400, 409, 422, 500)


@pytest.mark.asyncio
async def test_cascade_delete_user_contacts(
    db_session: AsyncSession, test_user: User
) -> None:
    """Deleting a user should cascade-delete their contacts."""
    contact = Contact(
        user_id=test_user.id,
        name="Cascade Test",
        facebook_profile_url="https://facebook.com/cascade",
        birthday=datetime.now(timezone.utc),
    )
    db_session.add(contact)
    await db_session.commit()

    # Delete user
    await db_session.delete(test_user)
    await db_session.commit()

    # Contact should be gone
    from sqlalchemy import select

    result = await db_session.execute(
        select(Contact).where(Contact.user_id == test_user.id)
    )
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_invalid_gender_enum_rejected(async_client: AsyncClient) -> None:
    """Schema validation should reject invalid gender values."""
    payload = {
        "name": "Test",
        "facebook_profile_url": "https://facebook.com/test",
        "birthday": datetime.now(timezone.utc).isoformat(),
        "gender": "INVALID_GENDER",
    }
    resp = await async_client.post("/api/contacts/", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_segment_type_rejected(async_client: AsyncClient) -> None:
    """Schema validation should reject invalid segment types."""
    resp = await async_client.post(
        "/templates/",
        json={
            "segment_type": "INVALID",
            "content": "test",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_birthday_config_mode_validation(async_client: AsyncClient) -> None:
    """Advance mode requires negative days, followup requires positive."""
    # Advance with positive offset
    resp = await async_client.post(
        "/api/birthday-configs",
        json={
            "mode": "advance",
            "days_offset": 3,
        },
    )
    assert resp.status_code == 422

    # Followup with negative offset
    resp2 = await async_client.post(
        "/api/birthday-configs",
        json={
            "mode": "followup",
            "days_offset": -2,
        },
    )
    assert resp2.status_code == 422
