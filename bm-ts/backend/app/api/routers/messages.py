from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, desc, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User, MessageQueue, MessageHistory
from app.db.session import get_db
from app.schemas.messages import (
    MessageQueue as MessageQueueSchema,
    MessageQueueCreate,
    MessageQueueUpdate,
    MessageHistoryItem,
)
from app.schemas.password_reset import MessageResponse
from app.api.routers.websocket import broadcast_message_queue_update, broadcast_message_history_update

router = APIRouter(prefix="/messages", tags=["messages"])


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


@router.post("/queue", response_model=MessageQueueSchema, status_code=status.HTTP_201_CREATED)
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
    await broadcast_message_queue_update(current_user.id, {
        "action": "created",
        "message": {
            "id": str(message.id),
            "friend_name": message.friend_name,
            "status": message.status,
            "scheduled_send_time": message.scheduled_send_time.isoformat(),
        },
        "timestamp": datetime.utcnow().isoformat(),
    })
    
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    if message.status not in ["pending", "failed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only update pending or failed messages",
        )

    if message_data.message_content is not None:
        message.message_content = message_data.message_content
    if message_data.scheduled_send_time is not None:
        message.scheduled_send_time = message_data.scheduled_send_time

    await db.commit()
    await db.refresh(message)
    
    # Broadcast real-time update
    await broadcast_message_queue_update(current_user.id, {
        "action": "updated",
        "message": {
            "id": str(message.id),
            "friend_name": message.friend_name,
            "status": message.status,
            "scheduled_send_time": message.scheduled_send_time.isoformat(),
        },
        "timestamp": datetime.utcnow().isoformat(),
    })
    
    return message


@router.delete("/queue/{message_id}", status_code=status.HTTP_200_OK)
async def cancel_queued_message(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    if message.status not in ["pending", "failed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only cancel pending or failed messages",
        )

    message_id_str = str(message.id)
    await db.delete(message)
    await db.commit()
    
    # Broadcast real-time update
    await broadcast_message_queue_update(current_user.id, {
        "action": "deleted",
        "message": {"id": message_id_str},
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"status": "deleted"}


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    if message.status != "failed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only retry failed messages",
        )

    message.status = "pending"
    message.error_message = None
    await db.commit()
    await db.refresh(message)
    
    # Broadcast real-time update
    await broadcast_message_queue_update(current_user.id, {
        "action": "updated",
        "message": {
            "id": str(message.id),
            "friend_name": message.friend_name,
            "status": message.status,
            "scheduled_send_time": message.scheduled_send_time.isoformat(),
        },
        "timestamp": datetime.utcnow().isoformat(),
    })
    
    return message


@router.get("/history", response_model=list[MessageHistoryItem])
async def list_message_history(
    search: str | None = Query(None, description="Search by friend name"),
    status_filter: str | None = Query(None, description="Filter by status"),
    start_date: datetime | None = Query(None, description="Start date"),
    end_date: datetime | None = Query(None, description="End date"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List message history with optional filters"""
    query = select(MessageHistory).where(MessageHistory.user_id == current_user.id)

    if search:
        query = query.where(MessageHistory.friend_name.ilike(f"%{search}%"))
    
    if status_filter:
        query = query.where(MessageHistory.status == status_filter)
    
    if start_date:
        query = query.where(MessageHistory.sent_at >= start_date)
    
    if end_date:
        query = query.where(MessageHistory.sent_at <= end_date)

    query = query.order_by(desc(MessageHistory.sent_at))
    
    result = await db.execute(query)
    messages = result.scalars().all()
    return messages


@router.delete("/history/{message_id}", status_code=status.HTTP_200_OK)
async def delete_message_history(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    message_id_str = str(message.id)
    await db.delete(message)
    await db.commit()
    
    # Broadcast real-time update
    await broadcast_message_history_update(current_user.id, {
        "action": "deleted",
        "message": {"id": message_id_str},
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"status": "deleted"}
