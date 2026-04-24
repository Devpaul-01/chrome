from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.db.models import MessageGroup, MessageTemplate, User
from app.schemas.message_template import (
    MessageTemplateCreate,
    MessageTemplateOut,
    MessageTemplateUpdate,
)
from app.schemas.common import DeleteResponse

router = APIRouter(tags=["message-templates"])


@router.post(
    "/message-templates",
    response_model=MessageTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_message_template(
    data: MessageTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageTemplateOut:
    """Create a new complete message template"""
    # Validate that the referenced group belongs to the current user
    if data.group_id is not None:
        group_result = await db.execute(
            select(MessageGroup).where(
                MessageGroup.id == data.group_id,
                MessageGroup.user_id == current_user.id,
            )
        )
        if group_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message group not found",
            )

    # Check unique title per user
    dup_stmt = select(MessageTemplate).where(
        MessageTemplate.user_id == current_user.id,
        MessageTemplate.title == data.title,
    )
    dup_result = await db.execute(dup_stmt)
    if dup_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A template with this title already exists",
        )

    template = MessageTemplate(
        user_id=current_user.id,
        title=data.title,
        greeting=data.greeting,
        sentiment=data.sentiment,
        closing=data.closing,
        image_url=data.image_url,
        days_in_advance=data.days_in_advance,
        gender=data.gender,
        group_id=data.group_id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/message-templates", response_model=List[MessageTemplateOut])
async def list_message_templates(
    gender: Optional[str] = None,
    group_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[MessageTemplateOut]:
    """List all message templates for the current user"""
    stmt = select(MessageTemplate).where(MessageTemplate.user_id == current_user.id)

    if gender:
        stmt = stmt.where(MessageTemplate.gender == gender)
    if group_id is not None:
        stmt = stmt.where(MessageTemplate.group_id == group_id)

    stmt = stmt.order_by(MessageTemplate.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/message-templates/{template_id}", response_model=MessageTemplateOut)
async def get_message_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageTemplateOut:
    """Get a specific message template"""
    stmt = select(MessageTemplate).where(
        MessageTemplate.id == template_id,
        MessageTemplate.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message template not found"
        )

    return template


@router.put("/message-templates/{template_id}", response_model=MessageTemplateOut)
async def update_message_template(
    template_id: UUID,
    data: MessageTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageTemplateOut:
    """Update a message template"""
    stmt = select(MessageTemplate).where(
        MessageTemplate.id == template_id,
        MessageTemplate.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message template not found"
        )

    # Update fields — explicit allowlist to prevent mass assignment
    _ALLOWED_FIELDS = {
        "title",
        "greeting",
        "sentiment",
        "closing",
        "image_url",
        "days_in_advance",
        "gender",
        "group_id",
    }
    update_data = data.model_dump(exclude_unset=True)

    # Check unique title if being changed
    if "title" in update_data and update_data["title"] != template.title:
        dup_stmt = select(MessageTemplate).where(
            MessageTemplate.user_id == current_user.id,
            MessageTemplate.title == update_data["title"],
            MessageTemplate.id != template_id,
        )
        dup_result = await db.execute(dup_stmt)
        if dup_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A template with this title already exists",
            )

    # Validate group ownership if group_id is being changed
    if "group_id" in update_data and update_data["group_id"] is not None:
        group_result = await db.execute(
            select(MessageGroup).where(
                MessageGroup.id == update_data["group_id"],
                MessageGroup.user_id == current_user.id,
            )
        )
        if group_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message group not found",
            )

    for field, value in update_data.items():
        if field in _ALLOWED_FIELDS:
            setattr(template, field, value)

    await db.commit()
    await db.refresh(template)
    return template


@router.delete(
    "/message-templates/{template_id}",
    response_model=DeleteResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_message_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeleteResponse:
    """Delete a message template"""
    stmt = select(MessageTemplate).where(
        MessageTemplate.id == template_id,
        MessageTemplate.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message template not found"
        )

    await db.delete(template)
    await db.commit()
    return DeleteResponse()
