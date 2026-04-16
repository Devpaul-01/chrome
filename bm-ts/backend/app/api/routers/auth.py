"""
api/routers/auth.py — Authentication, profile, and account-management endpoints.

All routes are mounted under ``/auth`` (set in main.py).

Endpoints
---------
POST  /auth/register               Register a new account, send verification email.
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
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_token_payload,
    get_current_user,
    get_current_user_allow_unverified,
)
from app.core.jwt import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
    ensure_token_type,
)
from app.core.security import hash_password, verify_password
from app.db.models import (
    User,
    RevokedToken,
    UserSession,
    TemplateSegment,
    MessageTemplate,
    BirthdaySchedule,
    Contact,
    MessageQueue,
    MessageHistory,
)
from app.db.session import get_db
from app.schemas.auth import (
    ActiveSession,
    LoginRequest,
    RegisterRequest,
    RefreshRequest,
    TokenResponse,
    UserProfile,
    UserProfileUpdate,
)
from app.schemas.common import MessageResponse
from app.schemas.password_reset import (
    RequestPasswordResetRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
)
from app.schemas.email_verification import (
    RequestEmailVerificationRequest,
    VerifyEmailRequest,
)
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

logger = logging.getLogger(__name__)

router = APIRouter()


def _coerce_expiry(expiry_value: Any) -> datetime:
    """Normalise a JWT ``exp`` claim into a timezone-aware UTC datetime."""
    if isinstance(expiry_value, datetime):
        return (
            expiry_value
            if expiry_value.tzinfo
            else expiry_value.replace(tzinfo=timezone.utc)
        )
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
    result = await db.execute(
        select(RevokedToken).where(RevokedToken.refresh_token_jti == jti)
    )
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


@router.post(
    "/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("5/minute")
async def register(
    request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Register a new account.  Sends a verification email; the user must verify before logging in."""
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        last_login_at=datetime.now(timezone.utc),
        failed_login_count=0,
        email_verified=False,
        metadata_payload={},
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    # Send email verification; do not fail registration if email sending fails
    try:
        token = await create_verification_token(user, db)
        await send_verification_email(user.email, token)
    except Exception as e:
        logger.warning("Failed to send verification email to %s: %s", user.email, e)
    return MessageResponse(
        message="Account created. Please check your email to verify your account before logging in."
    )


# Account lockout constants
_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_MINUTES = 15


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
@limiter.limit("20/hour", key_func=get_remote_address)
async def login(
    request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
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

    if not user or not verify_password(
        data.password, user.password_hash if user else ""
    ):
        # When user is None, run a dummy verify to prevent timing oracle (user enumeration)
        if not user:
            verify_password(
                data.password,
                "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dummyhashdummyhashdummyhashdummy",
            )
        # Increment failed login counter (only if user exists)
        if user:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= _MAX_FAILED_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(
                    minutes=_LOCKOUT_MINUTES
                )
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in. Check your inbox for the verification link.",
        )

    # Successful login — reset lockout state
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)
    response, _ = await _issue_session_tokens(user, db, request)
    await db.commit()
    return response


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc

    # Verify the user still exists (prevents deleted users from refreshing)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists"
        )

    session: UserSession | None = None
    if session_id is not None:
        try:
            session_uuid = UUID(str(session_id))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            ) from exc

        session_result = await db.execute(
            select(UserSession).where(
                UserSession.id == session_uuid, UserSession.user_id == user_id
            )
        )
        session = session_result.scalar_one_or_none()
        if session is None or session.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )
        if session.current_refresh_token_jti != jti:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )

    # If jti present, ensure it hasn't been revoked already
    if jti:
        stmt = select(RevokedToken).where(RevokedToken.refresh_token_jti == jti)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )

    expires_at = _coerce_expiry(exp)
    await _ensure_revoked_token(db, jti=jti, user_id=user_id, expires_at=expires_at)
    response, _ = await _issue_session_tokens(user, db, request, session=session)
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc

    return response


@router.post("/revoke", response_model=MessageResponse)
async def revoke(
    data: RefreshRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Revoke (logout) a refresh token by recording its JTI in the revoked_tokens table."""
    try:
        payload = decode_token(data.refresh_token)
        ensure_token_type(payload, TokenType.REFRESH)
        jti = payload.get("jti")
        user_id = UUID(payload.get("sub"))
        session_id = payload.get("sid")
        exp = payload.get("exp")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    expires_at = _coerce_expiry(exp)

    if session_id is not None:
        try:
            session_uuid = UUID(str(session_id))
        except ValueError:
            session_uuid = None

        if session_uuid is not None:
            session_result = await db.execute(
                select(UserSession).where(
                    UserSession.id == session_uuid, UserSession.user_id == user_id
                )
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
        select(UserSession).where(
            UserSession.id == session_id, UserSession.user_id == current_user.id
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    await _revoke_session_record(session, db, reason="user_revoke")
    await db.commit()
    return MessageResponse(message="Session revoked")


@router.get("/me", response_model=UserProfile)
async def me(
    current_user: User = Depends(get_current_user_allow_unverified),
) -> UserProfile:
    """Return the profile of the currently authenticated user."""
    metadata = current_user.metadata_payload or {}
    return UserProfile(
        id=current_user.id,
        email=current_user.email,
        created_at=current_user.created_at,
        email_verified=current_user.email_verified,
        name=metadata.get("name"),
        timezone=metadata.get("timezone"),
    )


@router.post("/request-password-reset", response_model=MessageResponse)
@limiter.limit("1/minute")  #
@limiter.limit("5/hour")  # per IP address
@limiter.limit("20/hour", key_func=get_remote_address)  #
async def request_password_reset(
    request: Request,
    data: RequestPasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Request a password reset link"""
    # Always return success to prevent email enumeration
    stmt = select(User).where(User.email == data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        token = await create_reset_token(user, db)
        await send_reset_email(user.email, token)

    return MessageResponse(
        message="If an account exists with that email, a password reset link has been sent."
    )


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

    return MessageResponse(
        message="If an account exists with that email, a verification link has been sent."
    )


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(
    data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Consume an email verification token and mark the user's email as verified."""
    user = await verify_verification_token(data.token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    user.email_verified = True
    await mark_verification_token_used(data.token, db)
    await db.commit()

    return MessageResponse(message="Email verified successfully")


@router.get("/verify-email-page", response_class=HTMLResponse, include_in_schema=False)
async def verify_email_page(token: str = "") -> HTMLResponse:
    """Serve a self-contained HTML page that verifies the user's email.

    The page makes a client-side ``POST`` to ``/auth/verify-email`` so the
    existing API validation (token expiry, used-token check) is reused.
    """
    token_js = json.dumps(token).replace("<", "\u003c")
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verify Email &mdash; BirthdayMessaging</title>
<link href="https://fonts.googleapis.com/css?family=Inter:400,600,700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after {{ box-sizing:border-box; }}
  body {{
    margin:0; padding:40px 16px;
    background:#ffb34c;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
    color:#574232;
    min-height:100vh;
  }}
  .card {{
    max-width:420px; margin:0 auto;
    background:#ffffff;
    border-radius:0.75rem;
    padding:1.5rem;
    box-shadow:0 2px 8px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04);
  }}
  .logo {{ text-align:center; margin-bottom:1rem; }}
  .logo h1 {{
    margin:0; font-size:1.5rem; font-weight:700;
    color:#ca4f02;
  }}
  h2 {{
    margin:0 0 0.25rem; font-size:1.125rem; font-weight:700;
    color:#111827;
  }}
  .subtitle {{
    margin:0 0 1.25rem; font-size:0.875rem; color:#6e5a49;
  }}
  .btn-primary {{
    display:inline-flex; align-items:center; justify-content:center;
    width:100%; padding:0.625rem 0.75rem;
    font-size:0.875rem; font-weight:600;
    color:#fff; background:#ca4f02;
    border:none; border-radius:0.75rem;
    cursor:pointer; text-transform:uppercase; letter-spacing:0.08em;
    box-shadow:0 3px 8px rgba(202,79,2,.25),0 1px 3px rgba(202,79,2,.15);
    transition:background-color 0.2s ease-out,box-shadow 0.2s ease-out,transform 0.15s ease-out;
  }}
  .btn-primary:hover:not(:disabled) {{
    background:#e56717;
    transform:translateY(-2px);
    box-shadow:0 6px 16px rgba(202,79,2,.35),0 3px 6px rgba(202,79,2,.25);
  }}
  .btn-primary:active:not(:disabled) {{
    transform:translateY(0);
    box-shadow:0 2px 6px rgba(202,79,2,.25);
  }}
  .btn-primary:disabled {{ opacity:0.55; cursor:not-allowed; }}
  .msg {{
    padding:0.75rem 1rem; border-radius:0.5rem;
    margin-bottom:1rem; font-size:0.875rem; font-weight:500;
  }}
  .msg.error {{
    background:#fef2f2; border:1px solid #fca5a5; color:#991b1b;
  }}
  .msg.success {{
    background:#f0fdf4; border:1px solid #86efac; color:#166534;
  }}
</style>
</head>
<body>
<div class="card">
  <div class="logo"><h1>BirthdayMessaging</h1></div>
  <h2>Verify Your Email</h2>
  <p class="subtitle">Click the button below to confirm your email address.</p>
  <div id="feedback"></div>
  <button id="verifyBtn" class="btn-primary">Verify Email</button>
</div>
<script>
(function() {{
  var token = {token_js};
  var fb = document.getElementById('feedback');
  var btn = document.getElementById('verifyBtn');
  if (!token) {{
    fb.className = 'msg error';
    fb.textContent = 'Missing verification token. Please use the link from your email.';
    btn.disabled = true;
    return;
  }}
  btn.addEventListener('click', function() {{
    btn.disabled = true;
    btn.textContent = 'Verifying\u2026';
    fetch(window.location.origin + '/auth/verify-email', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ token: token }})
    }})
    .then(function(r) {{ return r.json().then(function(d) {{ return {{ ok: r.ok, data: d }}; }}); }})
    .then(function(res) {{
      if (res.ok) {{
        fb.className = 'msg success';
        fb.textContent = 'Email verified! You can now log in and use all features.';
        btn.style.display = 'none';
      }} else {{
        fb.className = 'msg error';
        fb.textContent = res.data.detail || 'Something went wrong. The link may have expired.';
        btn.disabled = false;
        btn.textContent = 'Verify Email';
      }}
    }})
    .catch(function() {{
      fb.className = 'msg error';
      fb.textContent = 'Network error. Please try again.';
      btn.disabled = false;
      btn.textContent = 'Verify Email';
    }});
  }});
}})();
</script>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    """Reset password using a token"""
    user = await verify_reset_token(data.token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Update password
    user.password_hash = hash_password(data.new_password)
    await mark_token_used(data.token, db)

    # Invalidate all active sessions — attacker's stolen session must not survive a reset
    session_result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
        )
    )
    for s in session_result.scalars().all():
        await _revoke_session_record(s, db, reason="password_reset")

    await db.commit()

    return MessageResponse(message="Password has been reset successfully")


@router.get(
    "/reset-password-page", response_class=HTMLResponse, include_in_schema=False
)
async def reset_password_page(token: str = "") -> HTMLResponse:
    """Serve a self-contained HTML page where the user can set a new password.

    The page makes a client-side ``POST`` to ``/auth/reset-password`` so the
    existing API validation (token expiry, used-token check, password strength)
    is reused without duplication.
    """
    token_js = json.dumps(token).replace("<", "\u003c")
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset Password &mdash; BirthdayMessaging</title>
<link href="https://fonts.googleapis.com/css?family=Inter:400,600,700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after {{ box-sizing:border-box; }}
  body {{
    margin:0; padding:40px 16px;
    background:#ffb34c;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
    color:#574232;
    min-height:100vh;
  }}
  .card {{
    max-width:420px; margin:0 auto;
    background:#ffffff;
    border-radius:0.75rem;
    padding:1.5rem;
    box-shadow:0 2px 8px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04);
  }}
  .logo {{ text-align:center; margin-bottom:1rem; }}
  .logo h1 {{
    margin:0; font-size:1.5rem; font-weight:700;
    color:#ca4f02;
  }}
  h2 {{
    margin:0 0 0.25rem; font-size:1.125rem; font-weight:700;
    color:#111827;
  }}
  .subtitle {{
    margin:0 0 1.25rem; font-size:0.875rem; color:#6e5a49;
  }}
  label {{
    display:block; margin-bottom:0.25rem;
    font-size:0.8125rem; font-weight:600; color:#574232;
  }}
  input {{
    width:100%; padding:0.65rem 1rem;
    border:none; border-radius:0.5rem;
    background:#ffffff;
    box-shadow:0 2px 4px rgba(0,0,0,.05);
    font-size:0.9375rem; color:#574232;
    margin-bottom:0.875rem;
    transition:box-shadow 0.2s ease-out;
  }}
  input:focus {{
    outline:none;
    box-shadow:0 0 0 3px rgba(42,127,160,.15),0 2px 8px rgba(42,127,160,.2);
  }}
  .btn-primary {{
    display:inline-flex; align-items:center; justify-content:center;
    width:100%; padding:0.625rem 0.75rem;
    font-size:0.875rem; font-weight:600;
    color:#fff; background:#ca4f02;
    border:none; border-radius:0.75rem;
    cursor:pointer; text-transform:uppercase; letter-spacing:0.08em;
    box-shadow:0 3px 8px rgba(202,79,2,.25),0 1px 3px rgba(202,79,2,.15);
    transition:background-color 0.2s ease-out,box-shadow 0.2s ease-out,transform 0.15s ease-out;
    margin-top:0.5rem;
  }}
  .btn-primary:hover:not(:disabled) {{
    background:#e56717;
    transform:translateY(-2px);
    box-shadow:0 6px 16px rgba(202,79,2,.35),0 3px 6px rgba(202,79,2,.25);
  }}
  .btn-primary:active:not(:disabled) {{
    transform:translateY(0);
    box-shadow:0 2px 6px rgba(202,79,2,.25);
  }}
  .btn-primary:disabled {{ opacity:0.55; cursor:not-allowed; }}
  .msg {{
    padding:0.75rem 1rem; border-radius:0.5rem;
    margin-bottom:1rem; font-size:0.875rem; font-weight:500;
  }}
  .msg.error {{
    background:#fef2f2; border:1px solid #fca5a5; color:#991b1b;
  }}
  .msg.success {{
    background:#f0fdf4; border:1px solid #86efac; color:#166534;
  }}
</style>
</head>
<body>
<div class="card">
  <div class="logo"><h1>BirthdayMessaging</h1></div>
  <h2>Set a New Password</h2>
  <p class="subtitle">Choose a strong password with at least 8 characters.</p>
  <div id="feedback"></div>
  <form id="resetForm">
    <label for="password">New Password</label>
    <input id="password" type="password" minlength="8" maxlength="128" required placeholder="At least 8 characters">
    <label for="confirm">Confirm Password</label>
    <input id="confirm" type="password" minlength="8" maxlength="128" required placeholder="Re-enter your password">
    <button type="submit" id="submitBtn" class="btn-primary">Reset Password</button>
  </form>
</div>
<script>
(function() {{
  var token = {token_js};
  var form = document.getElementById('resetForm');
  var fb = document.getElementById('feedback');
  var btn = document.getElementById('submitBtn');
  if (!token) {{
    fb.className = 'msg error';
    fb.textContent = 'Missing reset token. Please use the link from your email.';
    btn.disabled = true;
    return;
  }}
  form.addEventListener('submit', function(e) {{
    e.preventDefault();
    fb.textContent = '';
    fb.className = '';
    var pw = document.getElementById('password').value;
    var cf = document.getElementById('confirm').value;
    if (pw !== cf) {{
      fb.className = 'msg error';
      fb.textContent = 'Passwords do not match.';
      return;
    }}
    btn.disabled = true;
    btn.textContent = 'Resetting\u2026';
    fetch(window.location.origin + '/auth/reset-password', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ token: token, new_password: pw }})
    }})
    .then(function(r) {{ return r.json().then(function(d) {{ return {{ ok: r.ok, data: d }}; }}); }})
    .then(function(res) {{
      if (res.ok) {{
        fb.className = 'msg success';
        fb.textContent = 'Password reset! You can now log in with your new password.';
        form.style.display = 'none';
      }} else {{
        fb.className = 'msg error';
        fb.textContent = res.data.detail || 'Something went wrong. The link may have expired.';
        btn.disabled = false;
        btn.textContent = 'Reset Password';
      }}
    }})
    .catch(function() {{
      fb.className = 'msg error';
      fb.textContent = 'Network error. Please try again.';
      btn.disabled = false;
      btn.textContent = 'Reset Password';
    }});
  }});
}})();
</script>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    token_payload: dict[str, Any] = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Change password for authenticated user"""
    # Verify current password
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Update password
    current_user.password_hash = hash_password(data.new_password)

    # Invalidate all other sessions (keep the current one alive)
    current_sid = token_payload.get("sid")
    session_result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == current_user.id,
            UserSession.revoked_at.is_(None),
        )
    )
    for s in session_result.scalars().all():
        if current_sid and str(s.id) == str(current_sid):
            continue
        await _revoke_session_record(s, db, reason="password_changed")

    await db.commit()

    return MessageResponse(message="Password changed successfully")


@router.put("/profile", response_model=UserProfile)
async def update_profile(
    data: UserProfileUpdate,
    current_user: User = Depends(get_current_user_allow_unverified),
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    """Update user profile information"""
    metadata = current_user.metadata_payload or {}

    if data.name is not None:
        # Store in metadata for now since User model doesn't have name field
        metadata["name"] = data.name

    if data.timezone is not None:
        metadata["timezone"] = data.timezone

    if data.name is not None or data.timezone is not None:
        current_user.metadata_payload = metadata

    await db.commit()
    await db.refresh(current_user)

    # Extract metadata for response
    metadata = current_user.metadata_payload or {}
    return UserProfile(
        id=current_user.id,
        email=current_user.email,
        created_at=current_user.created_at,
        email_verified=current_user.email_verified,
        name=metadata.get("name"),
        timezone=metadata.get("timezone"),
    )


@router.delete("/account", response_model=MessageResponse)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Delete the current user's account permanently."""
    await db.delete(current_user)
    await db.commit()
    return MessageResponse(message="Account successfully deleted")


@router.get("/data-export")
async def export_user_data(
    current_user: User = Depends(get_current_user_allow_unverified),
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
        "created_at": current_user.created_at.isoformat()
        if current_user.created_at
        else None,
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
            "template_title": r.title,
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
        select(Contact).where(Contact.user_id == current_user.id).order_by(Contact.name)
    )
    contacts = [
        {
            "name": r.name,
            "profile_url": r.facebook_profile_url,
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
            "scheduled_send_time": r.scheduled_send_time.isoformat()
            if r.scheduled_send_time
            else None,
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
