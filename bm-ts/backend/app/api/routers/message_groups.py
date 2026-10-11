"""
routers/message_groups.py — CRUD endpoints for message groups (tags/labels).

  POST   /message-groups          create a message group
  GET    /message-groups          list groups for the current user
  GET    /message-groups/{id}     retrieve a single group
  PUT    /message-groups/{id}     update name or color
  DELETE /message-groups/{id}     delete a group
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.errors import AppError, ErrorCodes
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_active_entitlement
from app.db.models import MessageGroup, User
from app.db.session import get_db
from app.schemas.message_group import (
    MessageGroupCreate,
    MessageGroupOut,
    MessageGroupUpdate,
)
from app.schemas.common import DeleteResponse, ErrorResponse

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
}

router = APIRouter(responses=_ERROR_RESPONSES, dependencies=[Depends(require_active_entitlement)])


@router.post(
    "/message-groups",
    response_model=MessageGroupOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_message_group(
    data: MessageGroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageGroupOut:
    """Create a new message group."""
    message_group = MessageGroup(
        user_id=current_user.id,
        name=data.name,
        color=data.color,
    )
    db.add(message_group)
    await db.commit()
    await db.refresh(message_group)
    return message_group  # type: ignore[return-value]


@router.get("/message-groups", response_model=List[MessageGroupOut])
async def list_message_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[MessageGroupOut]:
    """List all message groups for the current user."""
    stmt = (
        select(MessageGroup)
        .where(MessageGroup.user_id == current_user.id)
        .order_by(MessageGroup.name)
    )
    result = await db.execute(stmt)
    return result.scalars().all()  # type: ignore[return-value]


@router.get("/message-groups/{group_id}", response_model=MessageGroupOut)
async def get_message_group(
    group_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageGroupOut:
    """Get a specific message group by ID."""
    stmt = select(MessageGroup).where(
        MessageGroup.id == group_id,
        MessageGroup.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    message_group = result.scalar_one_or_none()

    if not message_group:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.GROUP_NOT_FOUND,
            "Message group not found",
        )

    return message_group  # type: ignore[return-value]


@router.put("/message-groups/{group_id}", response_model=MessageGroupOut)
async def update_message_group(
    group_id: UUID,
    data: MessageGroupUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageGroupOut:
    """Update a message group."""
    stmt = select(MessageGroup).where(
        MessageGroup.id == group_id,
        MessageGroup.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    message_group = result.scalar_one_or_none()

    if not message_group:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.GROUP_NOT_FOUND,
            "Message group not found",
        )

    if data.name is not None:
        message_group.name = data.name
    if data.color is not None:
        message_group.color = data.color

    message_group.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(message_group)
    return message_group  # type: ignore[return-value]


@router.delete(
    "/message-groups/{group_id}",
    response_model=DeleteResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_message_group(
    group_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeleteResponse:
    """Delete a message group."""
    stmt = select(MessageGroup).where(
        MessageGroup.id == group_id,
        MessageGroup.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    message_group = result.scalar_one_or_none()

    if not message_group:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.GROUP_NOT_FOUND,
            "Message group not found",
        )

    await db.delete(message_group)
    await db.commit()
    return DeleteResponse()
