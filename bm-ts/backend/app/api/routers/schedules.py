"""
routers/schedules.py — CRUD endpoints for birthday schedule entries.

  GET    /schedules          list all schedules for the current user
  POST   /schedules          create a new schedule (unique per days_before value)
  PUT    /schedules/{id}     update the enabled flag
  DELETE /schedules/{id}     delete a schedule entry
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User, BirthdaySchedule
from app.db.session import get_db
from app.schemas.schedules import (
    BirthdaySchedule as BirthdayScheduleSchema,
    BirthdayScheduleCreate,
    BirthdayScheduleUpdate,
)

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get("", response_model=list[BirthdayScheduleSchema])
async def list_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all birthday schedules for the current user"""
    result = await db.execute(
        select(BirthdaySchedule)
        .where(BirthdaySchedule.user_id == current_user.id)
        .order_by(BirthdaySchedule.days_before)
    )
    schedules = result.scalars().all()
    return schedules


@router.post("", response_model=BirthdayScheduleSchema, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    schedule_data: BirthdayScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new birthday schedule"""
    # Check if schedule already exists for this user and days_before
    result = await db.execute(
        select(BirthdaySchedule).where(
            and_(
                BirthdaySchedule.user_id == current_user.id,
                BirthdaySchedule.days_before == schedule_data.days_before,
            )
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Schedule for {schedule_data.days_before} days before already exists",
        )

    schedule = BirthdaySchedule(
        user_id=current_user.id,
        days_before=schedule_data.days_before,
        enabled=schedule_data.enabled,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.put("/{schedule_id}", response_model=BirthdayScheduleSchema)
async def update_schedule(
    schedule_id: UUID,
    schedule_data: BirthdayScheduleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing birthday schedule"""
    result = await db.execute(
        select(BirthdaySchedule).where(
            and_(
                BirthdaySchedule.id == schedule_id,
                BirthdaySchedule.user_id == current_user.id,
            )
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )

    if schedule_data.enabled is not None:
        schedule.enabled = schedule_data.enabled

    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_200_OK)
async def delete_schedule(
    schedule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete a birthday schedule"""
    result = await db.execute(
        select(BirthdaySchedule).where(
            and_(
                BirthdaySchedule.id == schedule_id,
                BirthdaySchedule.user_id == current_user.id,
            )
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )

    await db.delete(schedule)
    await db.commit()
    return {"status": "deleted"}
