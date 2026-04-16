"""
routers/templates.py — CRUD endpoints for template segments.

  POST   /templates/       create a segment (GREETING / BODY / CLOSING)
  GET    /templates/       list segments (optional segment_type filter)
  PUT    /templates/{id}   update content or label of a segment
  DELETE /templates/{id}   soft-delete a segment (sets deleted_at)

Segments are the atomic building-blocks composed by
``services/templates.py::compose_message`` into full birthday messages.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import TemplateSegment, User
from app.db.session import get_db
from app.schemas.template import (
    SegmentTypeEnum,
    TemplateSegmentCreate,
    TemplateSegmentOut,
    TemplateSegmentUpdate,
)
from app.schemas.common import DeleteResponse
from app.services.templates import compose_message

router = APIRouter()


@router.post(
    "/", response_model=TemplateSegmentOut, status_code=status.HTTP_201_CREATED
)
async def create_template(
    data: TemplateSegmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TemplateSegmentOut:
    """Create a new template segment owned by the current user."""
    segment = TemplateSegment(
        user_id=current_user.id,
        segment_type=data.segment_type.value,
        content=data.content,
        label=data.label,
    )
    db.add(segment)
    await db.commit()
    await db.refresh(segment)
    return segment


@router.get("/", response_model=List[TemplateSegmentOut])
async def list_templates(
    segment_type: SegmentTypeEnum | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[TemplateSegmentOut]:
    """List all (non-deleted) template segments; optionally filtered by ``segment_type``."""
    stmt = select(TemplateSegment).where(
        TemplateSegment.user_id == current_user.id,
        TemplateSegment.deleted_at.is_(None),
    )
    if segment_type:
        stmt = stmt.where(TemplateSegment.segment_type == segment_type.value)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/{segment_id}", response_model=TemplateSegmentOut)
async def update_template(
    segment_id: UUID,
    data: TemplateSegmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TemplateSegmentOut:
    stmt = select(TemplateSegment).where(
        TemplateSegment.id == segment_id,
        TemplateSegment.user_id == current_user.id,
        TemplateSegment.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    segment = result.scalar_one_or_none()
    if not segment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    if data.content is not None:
        segment.content = data.content
    if data.label is not None:
        segment.label = data.label
    segment.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(segment)
    return segment


@router.delete(
    "/{segment_id}", response_model=DeleteResponse, status_code=status.HTTP_200_OK
)
async def delete_template(
    segment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeleteResponse:
    """Soft-delete a template segment by setting its ``deleted_at`` timestamp."""
    stmt = select(TemplateSegment).where(
        TemplateSegment.id == segment_id,
        TemplateSegment.user_id == current_user.id,
        TemplateSegment.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    segment = result.scalar_one_or_none()
    if not segment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    segment.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return DeleteResponse()


@router.post("/preview", response_model=dict)
async def preview_message(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Compose a sample birthday message from the user's existing segments.

    Randomly selects one greeting, one body, and one closing segment and
    returns the assembled message.  Returns 400 if any segment group is empty.
    """
    stmt = select(TemplateSegment).where(
        TemplateSegment.user_id == current_user.id,
        TemplateSegment.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    segments = result.scalars().all()

    greetings = [
        s.content for s in segments if s.segment_type == SegmentTypeEnum.GREETING.value
    ]
    bodies = [
        s.content for s in segments if s.segment_type == SegmentTypeEnum.BODY.value
    ]
    closings = [
        s.content for s in segments if s.segment_type == SegmentTypeEnum.CLOSING.value
    ]

    try:
        message = compose_message(greetings, bodies, closings)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return {"message": message}
