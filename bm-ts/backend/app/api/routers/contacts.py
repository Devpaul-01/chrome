from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import Contact, User
from app.db.session import get_db
from app.schemas.contact import ContactCreate, ContactOut, ContactUpdate
from app.schemas.common import DeleteResponse

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.post("/", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(
    data: ContactCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContactOut:
    """Create a new contact."""
    contact = Contact(
        user_id=current_user.id,
        name=data.name,
        facebook_profile_url=data.facebook_profile_url,
        birthday=data.birthday,
        birthday_month_only=data.birthday_month_only,
        gender=data.gender.value if data.gender else None,
        notes=data.notes,
        group_id=data.group_id,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.post(
    "/bulk", response_model=List[ContactOut], status_code=status.HTTP_201_CREATED
)
async def bulk_create_contacts(
    contacts_data: List[ContactCreate],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ContactOut]:
    """Create or update multiple contacts at once (upsert on profile URL)."""
    if not contacts_data:
        return []

    results: list[Contact] = []
    now = datetime.now(timezone.utc)
    for data in contacts_data:
        stmt = select(Contact).where(
            Contact.user_id == current_user.id,
            Contact.facebook_profile_url == data.facebook_profile_url,
        )
        result = await db.execute(stmt)
        contact = result.scalar_one_or_none()

        if contact:
            contact.name = data.name
            contact.birthday = data.birthday
            contact.birthday_month_only = data.birthday_month_only or False
            contact.gender = data.gender.value if data.gender else None
            contact.notes = data.notes
            contact.updated_at = now
        else:
            contact = Contact(
                user_id=current_user.id,
                name=data.name,
                facebook_profile_url=data.facebook_profile_url,
                birthday=data.birthday,
                birthday_month_only=data.birthday_month_only or False,
                gender=data.gender.value if data.gender else None,
                notes=data.notes,
            )
            db.add(contact)

        results.append(contact)

    await db.commit()
    for contact in results:
        await db.refresh(contact)
    return results


@router.get("/", response_model=List[ContactOut])
async def list_contacts(
    updated_since: Optional[str] = Query(
        None, description="ISO timestamp; return only contacts updated after this time"
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ContactOut]:
    """List all contacts for the current user, optionally filtered by last update time."""
    stmt = select(Contact).where(Contact.user_id == current_user.id)
    if updated_since:
        from datetime import datetime as dt

        try:
            cutoff = dt.fromisoformat(updated_since.replace("Z", "+00:00"))
            stmt = stmt.where(Contact.updated_at > cutoff)
        except ValueError:
            pass  # ignore malformed timestamp, return all
    stmt = stmt.order_by(Contact.name)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContactOut:
    """Get a specific contact by ID."""
    stmt = select(Contact).where(
        Contact.id == contact_id,
        Contact.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    contact = result.scalar_one_or_none()

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found"
        )

    return contact


@router.put("/{contact_id}", response_model=ContactOut)
async def update_contact(
    contact_id: UUID,
    data: ContactUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContactOut:
    """Update a contact."""
    stmt = select(Contact).where(
        Contact.id == contact_id,
        Contact.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    contact = result.scalar_one_or_none()

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found"
        )

    # Update fields if provided
    if data.name is not None:
        contact.name = data.name
    if data.facebook_profile_url is not None:
        contact.facebook_profile_url = data.facebook_profile_url
    if data.birthday is not None:
        contact.birthday = data.birthday
    if data.birthday_month_only is not None:
        contact.birthday_month_only = data.birthday_month_only
    if data.gender is not None:
        contact.gender = data.gender.value
    if data.notes is not None:
        contact.notes = data.notes
    if data.group_id is not None:
        contact.group_id = data.group_id

    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete(
    "/{contact_id}", response_model=DeleteResponse, status_code=status.HTTP_200_OK
)
async def delete_contact(
    contact_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeleteResponse:
    """Delete a contact."""
    stmt = select(Contact).where(
        Contact.id == contact_id,
        Contact.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    contact = result.scalar_one_or_none()

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found"
        )

    await db.delete(contact)
    await db.commit()
    return DeleteResponse()
