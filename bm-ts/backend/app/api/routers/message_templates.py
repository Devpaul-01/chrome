from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.db.models import MessageTemplate, User
from app.schemas.message_template import (
    MessageTemplateCreate,
    MessageTemplateOut,
    MessageTemplateUpdate,
)
from app.schemas.common import DeleteResponse

router = APIRouter(tags=["message-templates"])


@router.post("/message-templates", response_model=MessageTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_message_template(
    data: MessageTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageTemplateOut:
    """Create a new complete message template"""
    template = MessageTemplate(
        user_id=current_user.id,
        title=data.title,
        greeting=data.greeting,
        sentiment=data.sentiment,
        closing=data.closing,
        image_url=data.image_url,
        days_in_advance=data.days_in_advance,
        gender=data.gender,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/message-templates", response_model=List[MessageTemplateOut])
async def list_message_templates(
    gender: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[MessageTemplateOut]:
    """List all message templates for the current user"""
    stmt = select(MessageTemplate).where(MessageTemplate.user_id == current_user.id)
    
    if gender:
        stmt = stmt.where(MessageTemplate.gender == gender)
    
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message template not found"
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message template not found"
        )
    
    # Update fields — explicit allowlist to prevent mass assignment
    _ALLOWED_FIELDS = {"title", "greeting", "sentiment", "closing", "image_url", "days_in_advance", "gender"}
    for field, value in data.model_dump(exclude_unset=True).items():
        if field in _ALLOWED_FIELDS:
            setattr(template, field, value)
    
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/message-templates/{template_id}", response_model=DeleteResponse, status_code=status.HTTP_200_OK)
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message template not found"
        )
    
    await db.delete(template)
    await db.commit()
    return DeleteResponse()
