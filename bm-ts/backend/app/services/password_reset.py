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
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import User, PasswordResetToken

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)


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
        created_at=datetime.now(timezone.utc),
    )

    db.add(reset_token)
    await db.commit()

    return raw_token


async def verify_reset_token(raw_token: str, db: AsyncSession) -> User | None:
    """Verify a password reset token and return the associated user.

    Uses SELECT FOR UPDATE to prevent race conditions when multiple
    requests attempt to consume the same token concurrently.
    """

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
        .with_for_update()
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

    Constructs a reset URL pointing to the backend-hosted reset page and
    dispatches the email asynchronously using ``asyncio.to_thread``.
    """

    if not settings.password_reset_url_base:
        raise ValueError("PASSWORD_RESET_URL_BASE is not configured. Set it in .env.")

    reset_url = f"{settings.password_reset_url_base}?token={token}"

    html_content = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden">
  <tr><td style="background-color:#4f46e5;padding:30px;text-align:center">
    <h1 style="margin:0;color:#ffffff;font-size:24px">BirthdayMessaging</h1>
  </td></tr>
  <tr><td style="padding:40px 30px">
    <h2 style="margin:0 0 16px;color:#333333;font-size:20px">Password Reset Request</h2>
    <p style="margin:0 0 24px;color:#555555;font-size:16px;line-height:1.5">
      We received a request to reset your password. Click the button below to choose a new one.
      This link will expire in <strong>30 minutes</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px">
    <tr><td style="background-color:#4f46e5;border-radius:6px;padding:14px 32px;text-align:center">
      <a href="{reset_url}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block">
        Reset Password
      </a>
    </td></tr>
    </table>
    <p style="margin:0 0 8px;color:#888888;font-size:13px">
      If you didn&rsquo;t request this, you can safely ignore this email.
    </p>
  </td></tr>
  <tr><td style="background-color:#f4f4f7;padding:20px 30px;text-align:center">
    <p style="margin:0;color:#aaaaaa;font-size:12px">&copy; BirthdayMessaging. All rights reserved.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    message = Mail(
        from_email=settings.email_from_address,
        to_emails=email,
        subject="Password Reset Request",
        html_content=html_content,
    )

    try:
        sg = SendGridAPIClient(settings.sendgrid_api_key)
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                await asyncio.to_thread(sg.send, message)
                logger.info("Password reset email sent to %s", email)
                return
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    await asyncio.sleep(2**attempt)  # 1 s, 2 s
                    logger.warning(
                        "Retry %d/2 sending reset email to %s: %s",
                        attempt + 1,
                        email,
                        exc,
                    )
        logger.error(
            "Failed to send reset email to %s after 3 attempts: %s", email, last_exc
        )
    except Exception as e:
        logger.error("Failed to send reset email to %s: %s", email, e)
