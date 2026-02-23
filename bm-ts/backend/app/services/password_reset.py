import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

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
                PasswordResetToken.hash_token == hash_token,
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
        select(PasswordResetToken).where(PasswordResetToken.hash_token == hash_token)
    )
    
    reset_token = result.scalar_one_or_none()
    if reset_token:
        reset_token.used_at = datetime.now(timezone.utc)
        await db.commit()


async def send_reset_email(email: str, token: str) -> None:
    reset_url = f"chrome-extension://YOUR_EXTENSION_ID/popup.html?token={token}"
    
    print(f"Password reset requested for {email}")
    print(f"Reset URL: {reset_url}")
    print(f"Token: {token}")
    
    message = Mail(
        from_email="noreply@yourdomain.com",
        to_emails=email,
        subject="Password Reset Request",
        html_content=f"<p>Click <a href='{reset_url}'>here</a> to reset your password.</p>"
    )

    sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
    sg.send(message)
