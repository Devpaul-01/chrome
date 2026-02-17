import secrets
from datetime import datetime, timedelta

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, PasswordResetToken


async def create_reset_token(user: User, db: AsyncSession) -> str:
    """Create a password reset token for a user"""
    # Generate a secure random token
    token = secrets.token_urlsafe(32)
    
    # Token expires in 1 hour
    expires_at = datetime.utcnow() + timedelta(hours=1)
    
    reset_token = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=expires_at,
    )
    db.add(reset_token)
    await db.commit()
    
    return token


async def verify_reset_token(token: str, db: AsyncSession) -> User | None:
    """Verify a password reset token and return the associated user"""
    result = await db.execute(
        select(PasswordResetToken, User)
        .join(User, PasswordResetToken.user_id == User.id)
        .where(
            and_(
                PasswordResetToken.token == token,
                PasswordResetToken.expires_at > datetime.utcnow(),
                PasswordResetToken.used_at.is_(None),
            )
        )
    )
    row = result.first()
    if not row:
        return None
    
    return row[1]


async def mark_token_used(token: str, db: AsyncSession) -> None:
    """Mark a password reset token as used"""
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == token)
    )
    reset_token = result.scalar_one_or_none()
    if reset_token:
        reset_token.used_at = datetime.utcnow()
        await db.commit()


async def send_reset_email(email: str, token: str) -> None:
    """Send a password reset email
    
    TODO: Implement actual email sending logic
    For now, this is a placeholder that logs the token
    """
    # In production, you would use an email service like SendGrid, AWS SES, etc.
    reset_url = f"chrome-extension://YOUR_EXTENSION_ID/popup.html?token={token}"
    
    print(f"Password reset requested for {email}")
    print(f"Reset URL: {reset_url}")
    print(f"Token: {token}")
    
    # TODO: Replace with actual email sending
    # Example with SendGrid:
    # from sendgrid import SendGridAPIClient
    # from sendgrid.helpers.mail import Mail
    # 
    # message = Mail(
    #     from_email='noreply@yourdomain.com',
    #     to_emails=email,
    #     subject='Password Reset Request',
    #     html_content=f'<p>Click <a href="{reset_url}">here</a> to reset your password.</p>'
    # )
    # sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
    # sg.send(message)
