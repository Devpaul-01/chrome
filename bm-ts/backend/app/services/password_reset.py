"""
services/password_reset.py — Password reset token lifecycle management.

Tokens are generated as URL-safe random bytes (``secrets.token_urlsafe``),
then stored as a SHA-256 hash so that the raw token value is never persisted
in the database (defence-in-depth: a DB leak does not expose usable tokens).

Token expiry: 30 minutes from creation.
Rate limiting on the endpoint is handled upstream in the auth router.
"""

import asyncio
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import User, PasswordResetToken

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

async def create_reset_token(user: User, db: AsyncSession) -> str:
    """Create a password reset token for a user"""
    # Generate a secure random token
    raw_token = secrets.token_urlsafe(32)

    hash_token = hashlib.sha256(raw_token.encode()).hexdigest()
    
    # Token expires in 1 hour
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    
    reset_token = PasswordResetToken(
        user_id=user.id,
        token=hash_token,
        expires_at=expires_at,
        used_at=None,
    )

    db.add(reset_token)
    await db.commit()
    
    return raw_token


async def verify_reset_token(raw_token: str, db: AsyncSession) -> User | None:
    """Verify a password reset token and return the associated user"""

    hash_token = hashlib.sha256(raw_token.encode()).hexdigest()

    result = await db.execute(
        select(PasswordResetToken, User)
        .join(User, PasswordResetToken.user_id == User.id)
        .where(
            and_(
                PasswordResetToken.token == hash_token,
                PasswordResetToken.expires_at > datetime.now(timezone.utc),
                PasswordResetToken.used_at.is_(None),
            )
        )
    )

    row = result.first()
    if not row:
        return None
    
    return row[1]


async def mark_token_used(raw_token: str, db: AsyncSession) -> None:
    """Mark a password reset token as used"""

    hash_token = hashlib.sha256(raw_token.encode()).hexdigest()

    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == hash_token)
    )
    
    reset_token = result.scalar_one_or_none()
    if reset_token:
        reset_token.used_at = datetime.now(timezone.utc)
        await db.commit()


async def send_reset_email(email: str, token: str) -> None:
    """Send a password reset email via SendGrid.

    Constructs a reset URL pointing to the Chrome extension popup and
    dispatches the email asynchronously using ``asyncio.to_thread``.
    """

    if not settings.password_reset_url_base:
        raise ValueError("PASSWORD_RESET_URL_BASE is not configured. Set it in .env.")

    reset_url = f"{settings.password_reset_url_base}?token={token}"

    message = Mail(
        from_email=settings.email_from_address,
        to_emails=email,
        subject="Password Reset Request",
        html_content=f'<p>Click <a href="{reset_url}">here</a> to reset your password.</p>'
    )

    try:
        sg = SendGridAPIClient(os.environ.get("SENDGRID_API_KEY", ""))
        await asyncio.to_thread(sg.send, message)
        print(f"Password reset email sent to {email}")
    except Exception as e:
        print(f"Failed to send reset email to {email}: {e}")
        