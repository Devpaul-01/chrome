from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import SMTPConfig, User
from app.db.session import get_db
from app.schemas.smtp import SMTPConfigOut, SMTPConfigUpdate

router = APIRouter(prefix="/smtp", tags=["smtp"])


@router.get("/config", response_model=SMTPConfigOut | None)
async def get_smtp_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SMTPConfigOut | None:
    """Get SMTP configuration for the current user"""
    stmt = select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()
    return config


@router.put("/config", response_model=SMTPConfigOut)
async def update_smtp_config(
    data: SMTPConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SMTPConfigOut:
    """Update or create SMTP configuration for the current user"""
    stmt = select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()
    
    if config:
        # Update existing config
        config.host = data.host
        config.port = data.port
        config.username = data.username
        config.password = data.password  # Should encrypt in production
        config.use_tls = data.use_tls
        config.from_email = data.from_email
        config.from_name = data.from_name
    else:
        # Create new config
        config = SMTPConfig(
            user_id=current_user.id,
            host=data.host,
            port=data.port,
            username=data.username,
            password=data.password,  # Should encrypt in production
            use_tls=data.use_tls,
            from_email=data.from_email,
            from_name=data.from_name,
        )
        db.add(config)
    
    await db.commit()
    await db.refresh(config)
    return config
