from __future__ import annotations
from typing import Any
from datetime import datetime, timezone
from io import StringIO
import csv
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.core.errors import AppError, ErrorCodes
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User, MessageQueue, MessageHistory
from app.db.session import get_db
from app.schemas.messages import (
    MessageQueue as MessageQueueSchema,
    MessageQueueCreate,
    MessageQueueUpdate,
    MessageHistoryPage,
)
from app.schemas.common import DeleteResponse, ErrorResponse
from app.api.routers.websocket import (
    broadcast_message_queue_update,
    broadcast_message_history_update,
)

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
}

router = APIRouter(prefix="/messages", tags=["messages"], responses=_ERROR_RESPONSES)


@router.get("/queue", response_model=list[MessageQueueSchema])
async def list_queued_messages(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all queued messages for the current user"""
    result = await db.execute(
        select(MessageQueue)
        .where(MessageQueue.user_id == current_user.id)
        .order_by(MessageQueue.scheduled_send_time)
    )
    messages = result.scalars().all()
    return messages


@router.post(
    "/queue", response_model=MessageQueueSchema, status_code=status.HTTP_201_CREATED
)
async def create_queued_message(
    message_data: MessageQueueCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new queued message"""
    message = MessageQueue(
        user_id=current_user.id,
        friend_name=message_data.friend_name,
        friend_profile_url=message_data.friend_profile_url,
        birthday_date=message_data.birthday_date,
        scheduled_send_time=message_data.scheduled_send_time,
        message_content=message_data.message_content,
        status="pending",
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Broadcast real-time update
    await broadcast_message_queue_update(
        current_user.id,
        {
            "action": "created",
            "message": {
                "id": str(message.id),
                "friend_name": message.friend_name,
                "status": message.status,
                "scheduled_send_time": message.scheduled_send_time.isoformat(),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )

    return message


@router.put("/queue/{message_id}", response_model=MessageQueueSchema)
async def update_queued_message(
    message_id: UUID,
    message_data: MessageQueueUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a queued message"""
    result = await db.execute(
        select(MessageQueue).where(
            and_(
                MessageQueue.id == message_id,
                MessageQueue.user_id == current_user.id,
            )
        )
    )
    message = result.scalar_one_or_none()
    if not message:
        raise AppError(
            status.HTTP_404_NOT_FOUND, ErrorCodes.MESSAGE_NOT_FOUND, "Message not found"
        )

    if message.status not in ["pending", "failed"]:
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.INVALID_MESSAGE_STATE,
            "Can only update pending or failed messages",
        )

    if message_data.message_content is not None:
        message.message_content = message_data.message_content
    if message_data.scheduled_send_time is not None:
        message.scheduled_send_time = message_data.scheduled_send_time

    await db.commit()
    await db.refresh(message)

    # Broadcast real-time update
    await broadcast_message_queue_update(
        current_user.id,
        {
            "action": "updated",
            "message": {
                "id": str(message.id),
                "friend_name": message.friend_name,
                "status": message.status,
                "scheduled_send_time": message.scheduled_send_time.isoformat(),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )

    return message


@router.delete(
    "/queue/{message_id}", response_model=DeleteResponse, status_code=status.HTTP_200_OK
)
async def cancel_queued_message(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeleteResponse:
    """Cancel (delete) a queued message"""
    result = await db.execute(
        select(MessageQueue).where(
            and_(
                MessageQueue.id == message_id,
                MessageQueue.user_id == current_user.id,
            )
        )
    )
    message = result.scalar_one_or_none()
    if not message:
        raise AppError(
            status.HTTP_404_NOT_FOUND, ErrorCodes.MESSAGE_NOT_FOUND, "Message not found"
        )

    if message.status not in ["pending", "failed"]:
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.INVALID_MESSAGE_STATE,
            "Can only cancel pending or failed messages",
        )

    message_id_str = str(message.id)
    await db.delete(message)
    await db.commit()

    # Broadcast real-time update
    await broadcast_message_queue_update(
        current_user.id,
        {
            "action": "deleted",
            "message": {"id": message_id_str},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
    return DeleteResponse()


@router.post("/queue/{message_id}/retry", response_model=MessageQueueSchema)
async def retry_failed_message(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retry a failed message"""
    result = await db.execute(
        select(MessageQueue).where(
            and_(
                MessageQueue.id == message_id,
                MessageQueue.user_id == current_user.id,
            )
        )
    )
    message = result.scalar_one_or_none()
    if not message:
        raise AppError(
            status.HTTP_404_NOT_FOUND, ErrorCodes.MESSAGE_NOT_FOUND, "Message not found"
        )

    if message.status != "failed":
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            ErrorCodes.INVALID_MESSAGE_STATE,
            "Can only retry failed messages",
        )

    message.status = "pending"
    message.error_message = None
    await db.commit()
    await db.refresh(message)

    # Broadcast real-time update
    await broadcast_message_queue_update(
        current_user.id,
        {
            "action": "updated",
            "message": {
                "id": str(message.id),
                "friend_name": message.friend_name,
                "status": message.status,
                "scheduled_send_time": message.scheduled_send_time.isoformat(),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )

    return message


@router.get("/history", response_model=MessageHistoryPage)
async def list_message_history(
    search: str | None = Query(None, description="Search by friend name"),
    status_filter: str | None = Query(None, description="Filter by status"),
    start_date: datetime | None = Query(None, description="Start date"),
    end_date: datetime | None = Query(None, description="End date"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(25, ge=1, le=200, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List message history with optional filters and pagination"""
    base_query = select(MessageHistory).where(MessageHistory.user_id == current_user.id)

    if search:
        safe_search = search.replace("%", r"\%").replace("_", r"\_")
        base_query = base_query.where(
            MessageHistory.friend_name.ilike(f"%{safe_search}%", escape="\\")
        )

    if status_filter:
        base_query = base_query.where(MessageHistory.status == status_filter)

    if start_date:
        base_query = base_query.where(MessageHistory.sent_at >= start_date)

    if end_date:
        base_query = base_query.where(MessageHistory.sent_at <= end_date)

    # Count total matching rows
    count_result = await db.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total = count_result.scalar_one()

    # Apply ordering + pagination
    paged_query = base_query.order_by(desc(MessageHistory.sent_at))
    paged_query = paged_query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(paged_query)
    items = result.scalars().all()
    return MessageHistoryPage(items=items, total=total, page=page, page_size=page_size)  # type: ignore[arg-type]


@router.delete(
    "/history/{message_id}",
    response_model=DeleteResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_message_history(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeleteResponse:
    """Delete a message from history"""
    result = await db.execute(
        select(MessageHistory).where(
            and_(
                MessageHistory.id == message_id,
                MessageHistory.user_id == current_user.id,
            )
        )
    )
    message = result.scalar_one_or_none()
    if not message:
        raise AppError(
            status.HTTP_404_NOT_FOUND, ErrorCodes.MESSAGE_NOT_FOUND, "Message not found"
        )

    message_id_str = str(message.id)
    await db.delete(message)
    await db.commit()

    # Broadcast real-time update
    await broadcast_message_history_update(
        current_user.id,
        {
            "action": "deleted",
            "message": {"id": message_id_str},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
    return DeleteResponse()


@router.get("/history/export")
async def export_message_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Export the current user's full message history as a CSV file."""
    result = await db.execute(
        select(MessageHistory)
        .where(MessageHistory.user_id == current_user.id)
        .order_by(desc(MessageHistory.sent_at))
    )
    rows = result.scalars().all()

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "friend_name",
            "friend_profile_url",
            "status",
            "message_content",
            "sent_at",
            "error_message",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r.friend_name,
                r.friend_profile_url,
                r.status,
                r.message_content,
                r.sent_at.isoformat() if r.sent_at else "",
                r.error_message or "",
            ]
        )

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=message_history.csv"},
    )



