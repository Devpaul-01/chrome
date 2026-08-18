"""
routers/smtp.py — Endpoints for managing the user's SMTP configuration.

  GET /smtp/config   retrieve current SMTP settings
  PUT /smtp/config   upsert SMTP settings (creates if none exist)

SMTP passwords are encrypted at rest using Fernet symmetric encryption
(see ``core/encryption.py``).  API responses mask the password field.

Note: ``decrypt_value`` is not currently called in this router because no
backend service sends email via the user's SMTP server yet.  When a
server-side email service is implemented, use
``core.encryption.decrypt_value(config.password)`` to retrieve the
cleartext password before connecting to the SMTP server.
"""

from __future__ import annotations
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_active_entitlement
from app.db.models import SMTPConfig, User
from app.db.session import get_db
from app.schemas.smtp import SMTPConfigOut, SMTPConfigUpdate
from app.core.encryption import encrypt_value
from app.schemas.common import ErrorResponse

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
}

router = APIRouter(prefix="/smtp", tags=["smtp"], responses=_ERROR_RESPONSES, dependencies=[Depends(require_active_entitlement)])


@router.get("/config", response_model=SMTPConfigOut | None)
async def get_smtp_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SMTPConfigOut | None:
    """Get SMTP configuration for the current user"""
    stmt = select(SMTPConfig).where(SMTPConfig.user_id == current_user.id)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()

    if not config:
        return None

    return SMTPConfigOut(
        host=config.host,
        port=config.port,
        username=config.username,
        password="••••••••",
        use_tls=config.use_tls,
        from_email=config.from_email,
        from_name=config.from_name,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


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

    encrypted_password = encrypt_value(data.password)

    if config:
        # Update existing config
        config.host = data.host
        config.port = data.port
        config.username = data.username
        config.password = encrypted_password
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
            password=encrypted_password,
            use_tls=data.use_tls,
            from_email=data.from_email,
            from_name=data.from_name,
        )
        db.add(config)

    await db.commit()
    await db.refresh(config)

    return SMTPConfigOut(
        host=config.host,
        port=config.port,
        username=config.username,
        password="••••••••",
        use_tls=config.use_tls,
        from_email=config.from_email,
        from_name=config.from_name,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )
