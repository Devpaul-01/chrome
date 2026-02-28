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

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
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

router = APIRouter()


@router.post("/", response_model=TemplateSegmentOut)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    if data.content is not None:
        segment.content = data.content
    if data.label is not None:
        segment.label = data.label
    segment.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(segment)
    return segment


@router.delete("/{segment_id}", status_code=status.HTTP_200_OK)
async def delete_template(
    segment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Soft-delete a template segment by setting its ``deleted_at`` timestamp."""
    stmt = select(TemplateSegment).where(
        TemplateSegment.id == segment_id,
        TemplateSegment.user_id == current_user.id,
        TemplateSegment.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    segment = result.scalar_one_or_none()
    if not segment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    segment.deleted_at = datetime.utcnow()
    await db.commit()
    return {"status": "deleted"}
