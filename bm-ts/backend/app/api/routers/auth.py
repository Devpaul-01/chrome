"""
api/routers/auth.py — Authentication, profile, and account-management endpoints.

All routes are mounted under ``/auth`` (set in main.py).

Endpoints
---------
POST  /auth/register               Register a new account, return token pair.
POST  /auth/login                  Authenticate, return token pair.
POST  /auth/refresh                Exchange a refresh token for a new token pair.
GET   /auth/sessions               List active authenticated sessions.
DELETE /auth/sessions/{id}         Revoke a specific authenticated session.
GET   /auth/me                     Return the current user's profile.
POST  /auth/request-password-reset Send a password-reset email (rate: 5/hour).
POST  /auth/reset-password         Consume a reset token and set a new password.
POST  /auth/change-password        Change password for an authenticated user.
PUT   /auth/profile                Update profile fields (name, timezone).
DELETE /auth/account               Permanently delete the user's account.
GET   /auth/data-export            Export all user data as JSON (GDPR right to portability).

The password-reset flow intentionally returns an identical success response
whether or not the email exists, to prevent user enumeration attacks.
"""

from __future__ import annotations

import io
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_token_payload, get_current_user
from app.core.jwt import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
    ensure_token_type,
)
from app.core.security import hash_password, verify_password
from app.db.models import User, RevokedToken
from app.db.session import get_db
from app.schemas.auth import (
    ActiveSession,
    DeleteAccountRequest,
    LoginRequest,
    RegisterRequest,
    RefreshRequest,
    TokenResponse,
    UserProfile,
)
from app.schemas.password_reset import (
    RequestPasswordResetRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    MessageResponse,
)
from app.schemas.email_verification import (
    RequestEmailVerificationRequest,
    VerifyEmailRequest,
)
from app.schemas.smtp import UserProfileUpdate
from app.services.password_reset import (
    create_reset_token,
    verify_reset_token,
    mark_token_used,
    send_reset_email,
)
from app.services.email_verification import (
    create_verification_token,
    verify_verification_token,
    mark_token_used as mark_verification_token_used,
    send_verification_email,
)

from app.core.rate_limiter import limiter
from slowapi.util import get_remote_address

router = APIRouter()


def _coerce_expiry(expiry_value: Any) -> datetime:
    """Normalise a JWT ``exp`` claim into a timezone-aware UTC datetime."""
    if isinstance(expiry_value, datetime):
        return expiry_value if expiry_value.tzinfo else expiry_value.replace(tzinfo=timezone.utc)
    return datetime.fromtimestamp(int(expiry_value), timezone.utc)


def _request_ip(request: Request | None) -> str | None:
    if request is None or request.client is None:
        return None
    return request.client.host


def _request_user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    user_agent = request.headers.get("user-agent")
    if not user_agent:
        return None
    return user_agent[:500]


async def _ensure_revoked_token(
    db: AsyncSession, *, jti: str | None, user_id: UUID, expires_at: datetime
) -> None:
    if not jti:
        return
    result = await db.execute(select(RevokedToken).where(RevokedToken.refresh_token_jti == jti))
    if result.scalar_one_or_none() is None:
        db.add(
            RevokedToken(
                refresh_token_jti=jti,
                user_id=user_id,
                expires_at=expires_at,
                revoked_at=datetime.now(timezone.utc),
            )
        )


async def _issue_session_tokens(
    user: User,
    db: AsyncSession,
    request: Request | None,
    session: UserSession | None = None,
) -> tuple[TokenResponse, UserSession]:
    now = datetime.now(timezone.utc)
    if session is None:
        session = UserSession(
            user_id=user.id,
            current_refresh_token_jti="pending",
            ip_address=_request_ip(request),
            user_agent=_request_user_agent(request),
            created_at=now,
            last_seen_at=now,
            expires_at=now,
        )
        db.add(session)
        await db.flush()
    else:
        session.ip_address = _request_ip(request) or session.ip_address
        session.user_agent = _request_user_agent(request) or session.user_agent
        session.last_seen_at = now

    access_token = create_access_token(user.id, session.id)
    refresh_token = create_refresh_token(user.id, session.id)
    refresh_payload = decode_token(refresh_token)
    session.current_refresh_token_jti = refresh_payload["jti"]
    session.expires_at = _coerce_expiry(refresh_payload["exp"])

    return (
        TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
        ),
        session,
    )


async def _revoke_session_record(
    session: UserSession,
    db: AsyncSession,
    *,
    reason: str,
) -> None:
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        session.revoked_reason = reason
    await _ensure_revoked_token(
        db,
        jti=session.current_refresh_token_jti,
        user_id=session.user_id,
        expires_at=session.expires_at,
    )


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(
    request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    """Register a new account.  Returns a token pair on success; 400 if the email is already taken."""
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        last_login_at=datetime.now(timezone.utc),
        failed_login_count=0,
        email_verified=False,
        metadata_payload={},
    )
    db.add(user)
    await db.flush()
    response, _ = await _issue_session_tokens(user, db, request)
    await db.commit()
    await db.refresh(user)
    # Send email verification if configured
    try:
        # Create token and send email; do not fail registration if email sending fails
        if hasattr(send_verification_email, "__call__"):
            token = await create_verification_token(user, db)
            await send_verification_email(user.email, token)
    except Exception:
        # Swallow email errors to avoid blocking registration
        pass
    return response


# Account lockout constants
_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_MINUTES = 15


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
@limiter.limit("20/hour", key_func=get_remote_address)
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Authenticate with email + password.  Returns a token pair; 401 on invalid credentials.

    Accounts are temporarily locked after 5 consecutive failed login attempts.
    The lockout lasts 15 minutes, after which the counter resets on a successful login.
    """
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user and user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account temporarily locked due to too many failed login attempts. Try again later.",
        )

    if not user or not verify_password(data.password, user.password_hash):
        # Increment failed login counter (only if user exists)
        if user:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= _MAX_FAILED_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=_LOCKOUT_MINUTES)
            await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Successful login — reset lockout state
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)
    response, _ = await _issue_session_tokens(user, db, request)
    await db.commit()
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Exchange a valid refresh token for a fresh token pair; 401 on invalid/expired token."""
    try:
        payload = decode_token(data.refresh_token)
        ensure_token_type(payload, TokenType.REFRESH)
        user_id = UUID(payload.get("sub"))
        jti = payload.get("jti")
        session_id = payload.get("sid")
        exp = payload.get("exp")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    # Verify the user still exists (prevents deleted users from refreshing)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")

    session: UserSession | None = None
    if session_id is not None:
        try:
            session_uuid = UUID(str(session_id))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

        session_result = await db.execute(
            select(UserSession).where(UserSession.id == session_uuid, UserSession.user_id == user_id)
        )
        session = session_result.scalar_one_or_none()
        if session is None or session.revoked_at is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        if session.current_refresh_token_jti != jti:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # If jti present, ensure it hasn't been revoked already
    if jti:
        stmt = select(RevokedToken).where(RevokedToken.refresh_token_jti == jti)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    expires_at = _coerce_expiry(exp)
    await _ensure_revoked_token(db, jti=jti, user_id=user_id, expires_at=expires_at)
    response, _ = await _issue_session_tokens(user, db, request, session=session)
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    return response


@router.post("/revoke", response_model=MessageResponse)
async def revoke(data: RefreshRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    """Revoke (logout) a refresh token by recording its JTI in the revoked_tokens table."""
    try:
        payload = decode_token(data.refresh_token)
        ensure_token_type(payload, TokenType.REFRESH)
        jti = payload.get("jti")
        user_id = UUID(payload.get("sub"))
        session_id = payload.get("sid")
        exp = payload.get("exp")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    expires_at = _coerce_expiry(exp)

    if session_id is not None:
        try:
            session_uuid = UUID(str(session_id))
        except ValueError:
            session_uuid = None

        if session_uuid is not None:
            session_result = await db.execute(
                select(UserSession).where(UserSession.id == session_uuid, UserSession.user_id == user_id)
            )
            session = session_result.scalar_one_or_none()
            if session is not None:
                await _revoke_session_record(session, db, reason="logout")

    await _ensure_revoked_token(db, jti=jti, user_id=user_id, expires_at=expires_at)
    await db.commit()
    return MessageResponse(message="Token revoked")


@router.get("/sessions", response_model=list[ActiveSession])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    token_payload: dict[str, Any] = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
) -> list[ActiveSession]:
    """Return the user's active sessions ordered by recent activity."""
    current_session_id = token_payload.get("sid")
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(UserSession)
        .where(
            UserSession.user_id == current_user.id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .order_by(UserSession.last_seen_at.desc(), UserSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        ActiveSession(
            id=session.id,
            created_at=session.created_at,
            last_seen_at=session.last_seen_at,
            expires_at=session.expires_at,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
            is_current=str(session.id) == str(current_session_id),
        )
        for session in sessions
    ]


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def revoke_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Revoke one of the user's active sessions immediately."""
    result = await db.execute(
        select(UserSession).where(UserSession.id == session_id, UserSession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    await _revoke_session_record(session, db, reason="user_revoke")
    await db.commit()
    return MessageResponse(message="Session revoked")


@router.get("/me", response_model=UserProfile)
async def me(current_user: User = Depends(get_current_user)) -> UserProfile:
    """Return the profile of the currently authenticated user."""
    return current_user


@router.post("/request-password-reset", response_model=MessageResponse)
@limiter.limit("1/minute")                             #
@limiter.limit("5/hour")                               # per IP address
@limiter.limit("20/hour", key_func=get_remote_address) #
async def request_password_reset(
    request: Request,
    data: RequestPasswordResetRequest,
    db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Request a password reset link"""
    # Always return success to prevent email enumeration
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if user:
        token = await create_reset_token(user, db)
        await send_reset_email(user.email, token)
    
    return MessageResponse(message="If an account exists with that email, a password reset link has been sent.")


@router.post("/request-email-verification", response_model=MessageResponse)
@limiter.limit("1/minute")
@limiter.limit("5/hour")
@limiter.limit("20/hour", key_func=get_remote_address)
async def request_email_verification(
    request: Request,
    data: RequestEmailVerificationRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Request an email verification link for an existing account."""
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Always return success to avoid email enumeration
    if user and not user.email_verified:
        token = await create_verification_token(user, db)
        await send_verification_email(user.email, token)

    return MessageResponse(message="If an account exists with that email, a verification link has been sent.")


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    """Consume an email verification token and mark the user's email as verified."""
    user = await verify_verification_token(data.token, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification token")

    user.email_verified = True
    await mark_verification_token_used(data.token, db)
    await db.commit()

    return MessageResponse(message="Email verified successfully")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Reset password using a token"""
    user = await verify_reset_token(data.token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Update password
    user.password_hash = hash_password(data.new_password)
    await mark_token_used(data.token, db)
    await db.commit()
    
    return MessageResponse(message="Password has been reset successfully")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Change password for authenticated user"""
    # Verify current password
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Update password
    current_user.password_hash = hash_password(data.new_password)
    await db.commit()
    
    return MessageResponse(message="Password changed successfully")

@router.put("/profile", response_model=UserProfile)
async def update_profile(
    data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    """Update user profile information"""
    if data.name is not None:
        # Store in metadata for now since User model doesn't have name field
        metadata = current_user.metadata_payload or {}
        metadata["name"] = data.name
        current_user.metadata_payload = metadata
    
    if data.timezone is not None:
        metadata = current_user.metadata_payload or {}
        metadata["timezone"] = data.timezone
        current_user.metadata_payload = metadata
    
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.delete("/account", response_model=MessageResponse)
async def delete_account(
    data: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Delete the current user's account permanently.  Requires current password as confirmation."""
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )
    await db.delete(current_user)
    await db.commit()
    return MessageResponse(message="Account deleted successfully")


@router.get("/data-export")
async def export_user_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Export all data associated with the current user as a JSON file.

    Satisfies the GDPR right to data portability (Art. 20 GDPR).  The
    download includes the user's profile, message templates, birthday
    schedules, contacts, message queue, and full message history.

    The endpoint does not expose the password hash or internal IDs.
    """
    # ── Profile ──────────────────────────────────────────────────────────────
    metadata = current_user.metadata_payload or {}
    profile = {
        "email": current_user.email,
        "name": metadata.get("name"),
        "timezone": metadata.get("timezone"),
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }

    # ── Template segments ────────────────────────────────────────────────────
    tpl_result = await db.execute(
        select(TemplateSegment)
        .where(
            TemplateSegment.user_id == current_user.id,
            TemplateSegment.deleted_at.is_(None),
        )
        .order_by(TemplateSegment.created_at)
    )
    templates = [
        {
            "segment_type": str(r.segment_type),
            "label": r.label,
            "content": r.content,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in tpl_result.scalars().all()
    ]

    # ── Message templates (Phase 2) ──────────────────────────────────────────
    mt_result = await db.execute(
        select(MessageTemplate)
        .where(MessageTemplate.user_id == current_user.id)
        .order_by(MessageTemplate.created_at)
    )
    message_templates = [
        {
            "template_title": r.template_title,
            "greeting": r.greeting,
            "sentiment": r.sentiment,
            "closing": r.closing,
            "gender": str(r.gender) if r.gender else None,
            "days_in_advance": r.days_in_advance,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in mt_result.scalars().all()
    ]

    # ── Birthday schedules ───────────────────────────────────────────────────
    sched_result = await db.execute(
        select(BirthdaySchedule)
        .where(BirthdaySchedule.user_id == current_user.id)
        .order_by(BirthdaySchedule.days_before)
    )
    schedules = [
        {
            "days_before": r.days_before,
            "enabled": r.enabled,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in sched_result.scalars().all()
    ]

    # ── Contacts ─────────────────────────────────────────────────────────────
    contact_result = await db.execute(
        select(Contact)
        .where(Contact.user_id == current_user.id)
        .order_by(Contact.name)
    )
    contacts = [
        {
            "name": r.name,
            "profile_url": r.profile_url,
            "birthday": r.birthday.isoformat() if r.birthday else None,
            "gender": str(r.gender) if r.gender else None,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in contact_result.scalars().all()
    ]

    # ── Message queue (pending / failed) ─────────────────────────────────────
    queue_result = await db.execute(
        select(MessageQueue)
        .where(MessageQueue.user_id == current_user.id)
        .order_by(MessageQueue.scheduled_send_time)
    )
    queue = [
        {
            "friend_name": r.friend_name,
            "friend_profile_url": r.friend_profile_url,
            "birthday_date": r.birthday_date.isoformat() if r.birthday_date else None,
            "scheduled_send_time": r.scheduled_send_time.isoformat() if r.scheduled_send_time else None,
            "message_content": r.message_content,
            "status": str(r.status),
            "error_message": r.error_message,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in queue_result.scalars().all()
    ]

    # ── Message history ───────────────────────────────────────────────────────
    hist_result = await db.execute(
        select(MessageHistory)
        .where(MessageHistory.user_id == current_user.id)
        .order_by(MessageHistory.sent_at)
    )
    history = [
        {
            "friend_name": r.friend_name,
            "friend_profile_url": r.friend_profile_url,
            "birthday_date": r.birthday_date.isoformat() if r.birthday_date else None,
            "message_content": r.message_content,
            "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            "status": str(r.status),
            "error_message": r.error_message,
        }
        for r in hist_result.scalars().all()
    ]

    # ── Assemble payload ──────────────────────────────────────────────────────
    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
        "template_segments": templates,
        "message_templates": message_templates,
        "birthday_schedules": schedules,
        "contacts": contacts,
        "message_queue": queue,
        "message_history": history,
    }

    buf = io.BytesIO(json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="my-data.json"'},
    )
