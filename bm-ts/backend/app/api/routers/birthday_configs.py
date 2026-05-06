"""
routers/birthday_configs.py — CRUD endpoints for birthday automation configs.

  POST   /birthday-configs          create a new config
  GET    /birthday-configs          list configs (optional mode/enabled filter)
  GET    /birthday-configs/{id}     retrieve a single config
  PUT    /birthday-configs/{id}     update fields of a config
  PATCH  /birthday-configs/{id}/toggle  enable or disable a config
  DELETE /birthday-configs/{id}     delete a config

Each config specifies the timing mode (advance / normal / followup),
the days offset, and an optional message-group / post association.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.errors import AppError, ErrorCodes
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import BirthdayConfig, User
from app.db.session import get_db
from app.schemas.birthday_config import (
    BirthdayConfigCreate,
    BirthdayConfigOut,
    BirthdayConfigToggle,
    BirthdayConfigUpdate,
    BirthdayModeEnum,
)
from app.schemas.common import DeleteResponse, ErrorResponse

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
}

router = APIRouter(responses=_ERROR_RESPONSES)


@router.post(
    "/birthday-configs",
    response_model=BirthdayConfigOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_birthday_config(
    data: BirthdayConfigCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BirthdayConfigOut:
    """Create a new birthday configuration."""
    config = BirthdayConfig(
        user_id=current_user.id,
        mode=data.mode.value,
        days_offset=data.days_offset,
        message_group_id=data.message_group_id,
        post_id=data.post_id,
        gender_filter=data.gender_filter.value,
        archive_enabled=data.archive_enabled,
        enabled=data.enabled,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config  # type: ignore[return-value]


@router.get("/birthday-configs", response_model=List[BirthdayConfigOut])
async def list_birthday_configs(
    mode: BirthdayModeEnum | None = None,
    enabled: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[BirthdayConfigOut]:
    """List all birthday configurations for the current user."""
    stmt = select(BirthdayConfig).where(BirthdayConfig.user_id == current_user.id)

    if mode:
        stmt = stmt.where(BirthdayConfig.mode == mode.value)
    if enabled is not None:
        stmt = stmt.where(BirthdayConfig.enabled == enabled)

    stmt = stmt.order_by(BirthdayConfig.mode, BirthdayConfig.days_offset)
    result = await db.execute(stmt)
    return result.scalars().all()  # type: ignore[return-value]


@router.get("/birthday-configs/{config_id}", response_model=BirthdayConfigOut)
async def get_birthday_config(
    config_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BirthdayConfigOut:
    """Get a specific birthday configuration by ID."""
    stmt = select(BirthdayConfig).where(
        BirthdayConfig.id == config_id,
        BirthdayConfig.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.BIRTHDAY_CONFIG_NOT_FOUND,
            "Birthday configuration not found",
        )

    return config  # type: ignore[return-value]


@router.put("/birthday-configs/{config_id}", response_model=BirthdayConfigOut)
async def update_birthday_config(
    config_id: UUID,
    data: BirthdayConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BirthdayConfigOut:
    """Update a birthday configuration."""
    stmt = select(BirthdayConfig).where(
        BirthdayConfig.id == config_id,
        BirthdayConfig.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.BIRTHDAY_CONFIG_NOT_FOUND,
            "Birthday configuration not found",
        )

    if data.days_offset is not None:
        config.days_offset = data.days_offset
    if data.message_group_id is not None:
        config.message_group_id = data.message_group_id
    if data.post_id is not None:
        config.post_id = data.post_id
    if data.gender_filter is not None:
        config.gender_filter = data.gender_filter.value
    if data.archive_enabled is not None:
        config.archive_enabled = data.archive_enabled
    if data.enabled is not None:
        config.enabled = data.enabled

    config.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(config)
    return config  # type: ignore[return-value]


@router.patch("/birthday-configs/{config_id}/toggle", response_model=BirthdayConfigOut)
async def toggle_birthday_config(
    config_id: UUID,
    data: BirthdayConfigToggle,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BirthdayConfigOut:
    """Toggle a birthday configuration on/off."""
    stmt = select(BirthdayConfig).where(
        BirthdayConfig.id == config_id,
        BirthdayConfig.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.BIRTHDAY_CONFIG_NOT_FOUND,
            "Birthday configuration not found",
        )

    config.enabled = data.enabled
    config.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(config)
    return config  # type: ignore[return-value]


@router.delete(
    "/birthday-configs/{config_id}",
    response_model=DeleteResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_birthday_config(
    config_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeleteResponse:
    """Delete a birthday configuration."""
    stmt = select(BirthdayConfig).where(
        BirthdayConfig.id == config_id,
        BirthdayConfig.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            ErrorCodes.BIRTHDAY_CONFIG_NOT_FOUND,
            "Birthday configuration not found",
        )

    await db.delete(config)
    await db.commit()
    return DeleteResponse()
