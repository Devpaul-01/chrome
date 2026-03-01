import uuid
from datetime import datetime, timedelta
from backend.database import session_scope
from backend.models import User
from backend.service.bm_email import send_restore_password_email

RESET_EXPIRATION_HOURS = 1


def generate_reset_token():
    """Generate a unique password reset token."""
    return str(uuid.uuid4())


def request_password_reset(email: str):
    """Generate a reset token and send it to the user's email."""
    with session_scope() as session:
        user = session.query(User).filter_by(email=email).first()

        if not user:
            return {"success": False, "message": "Email not found."}

        token = generate_reset_token()
        expires_at = datetime.utcnow() + timedelta(hours=RESET_EXPIRATION_HOURS)

        user.password_reset_token = token
        user.password_reset_expires_at = expires_at
        session.commit()

        # Send reset email
        send_restore_password_email(email, token)

        return {"success": True, "message": "Password reset email sent."}


def reset_password(token: str, new_password_hash: str):
    """Validate the token and update the user's password."""
    with session_scope() as session:
        user = session.query(User).filter_by(password_reset_token=token).first()

        if not user:
            return {"success": False, "message": "Invalid or expired token."}

        if not user.password_reset_expires_at or datetime.utcnow() > user.password_reset_expires_at:
            return {"success": False, "message": "Token expired."}

        # Update password and clear reset token fields
        user.password = new_password_hash
        user.password_reset_token = None
        user.password_reset_expires_at = None

        session.commit()

        return {"success": True, "message": "Password updated successfully."}
