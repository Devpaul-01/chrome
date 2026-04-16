"""
services/email_verification.py — Email verification token lifecycle and sending.

Follows the same pattern as password_reset: tokens are URL-safe random strings,
stored as SHA-256 hashes, single-use, and emailed via SendGrid.
"""

import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import User, EmailVerificationToken

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)


essential_expiry_hours = 24


async def create_verification_token(user: User, db: AsyncSession) -> str:
    raw_token = secrets.token_urlsafe(32)
    hash_token = hashlib.sha256(raw_token.encode()).hexdigest()

    expires_at = datetime.now(timezone.utc) + timedelta(hours=essential_expiry_hours)

    token_row = EmailVerificationToken(
        user_id=user.id,
        token=hash_token,
        expires_at=expires_at,
        used_at=None,
        created_at=datetime.now(timezone.utc),
    )

    db.add(token_row)
    await db.commit()

    return raw_token


async def verify_verification_token(raw_token: str, db: AsyncSession) -> User | None:
    """Verify an email verification token.

    Uses SELECT FOR UPDATE to prevent race conditions.
    """
    hash_token = hashlib.sha256(raw_token.encode()).hexdigest()

    result = await db.execute(
        select(EmailVerificationToken, User)
        .join(User, EmailVerificationToken.user_id == User.id)
        .where(
            and_(
                EmailVerificationToken.token == hash_token,
                EmailVerificationToken.expires_at > datetime.now(timezone.utc),
                EmailVerificationToken.used_at.is_(None),
            )
        )
        .with_for_update()
    )

    row = result.first()
    if not row:
        return None

    return row[1]


async def mark_token_used(raw_token: str, db: AsyncSession) -> None:
    hash_token = hashlib.sha256(raw_token.encode()).hexdigest()

    result = await db.execute(
        select(EmailVerificationToken).where(EmailVerificationToken.token == hash_token)
    )

    token_row = result.scalar_one_or_none()
    if token_row:
        token_row.used_at = datetime.now(timezone.utc)
        await db.commit()


async def send_verification_email(email: str, token: str) -> None:
    if not settings.email_verification_url_base:
        raise ValueError(
            "EMAIL_VERIFICATION_URL_BASE is not configured. Set it in .env."
        )

    verify_url = f"{settings.email_verification_url_base}?token={token}"

    html_content = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#ffb34c;font-family:Inter,Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffb34c;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="padding:30px;text-align:center">
    <h1 style="margin:0;color:#ca4f02;font-size:24px;font-weight:700">BirthdayMessaging</h1>
  </td></tr>
  <tr><td style="padding:0 30px 40px">
    <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700">Verify Your Email</h2>
    <p style="margin:0 0 24px;color:#6e5a49;font-size:16px;line-height:1.5">
      Welcome! Click the button below to verify your email address for your BirthdayMessaging account.
      This link will expire in <strong>{essential_expiry_hours} hours</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px">
    <tr><td style="background-color:#ca4f02;border-radius:12px;padding:14px 32px;text-align:center;box-shadow:0 3px 8px rgba(202,79,2,.25)">
      <a href="{verify_url}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;text-transform:uppercase;letter-spacing:0.08em">
        Verify Email
      </a>
    </td></tr>
    </table>
    <p style="margin:0;color:#6e5a49;font-size:13px">
      If you didn&rsquo;t create an account, you can safely ignore this email.
    </p>
  </td></tr>
  <tr><td style="background-color:#fff8f0;padding:20px 30px;text-align:center;border-top:1px solid #f0e6d9">
    <p style="margin:0;color:#6e5a49;font-size:12px">&copy; BirthdayMessaging. All rights reserved.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    message = Mail(
        from_email=settings.email_from_address,
        to_emails=email,
        subject="Verify your BirthdayMessaging email",
        html_content=html_content,
    )

    try:
        sg = SendGridAPIClient(settings.sendgrid_api_key)
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                await asyncio.to_thread(sg.send, message)
                logger.info("Verification email sent to %s", email)
                return
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    await asyncio.sleep(2**attempt)  # 1 s, 2 s
                    logger.warning(
                        "Retry %d/2 sending verification email to %s: %s",
                        attempt + 1,
                        email,
                        exc,
                    )
        logger.error(
            "Failed to send verification email to %s after 3 attempts: %s",
            email,
            last_exc,
        )
    except Exception as e:
        logger.error("Failed to send verification email to %s: %s", email, e)
