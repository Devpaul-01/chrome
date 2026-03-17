"""
api/routers/auth.py — Authentication, profile, and account-management endpoints.

All routes are mounted under ``/auth`` (set in main.py).

Endpoints
---------
POST  /auth/register               Register a new account, return token pair.
POST  /auth/login                  Authenticate, return token pair.
POST  /auth/refresh                Exchange a refresh token for a new token pair.
GET   /auth/me                     Return the current user's profile.
POST  /auth/request-password-reset Send a password-reset email (rate: 5/hour).
POST  /auth/reset-password         Consume a reset token and set a new password.
POST  /auth/change-password        Change password for an authenticated user.
PUT   /auth/profile                Update profile fields (name, timezone).
DELETE /auth/account               Permanently delete the user's account.

The password-reset flow intentionally returns an identical success response
whether or not the email exists, to prevent user enumeration attacks.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
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
from app.schemas.smtp import UserProfileUpdate
from app.services.password_reset import (
    create_reset_token,
    verify_reset_token,
    mark_token_used,
    send_reset_email,
)

from app.core.rate_limiter import limiter
from slowapi.util import get_remote_address

router = APIRouter()


def _build_token_response(user_id: UUID) -> TokenResponse:
    """Create a fresh access + refresh token pair for ``user_id``."""
    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
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
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _build_token_response(user.id)


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
    await db.commit()
    return _build_token_response(user.id)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Exchange a valid refresh token for a fresh token pair; 401 on invalid/expired token."""
    try:
        payload = decode_token(data.refresh_token)
        ensure_token_type(payload, TokenType.REFRESH)
        user_id = UUID(payload.get("sub"))
        jti = payload.get("jti")
        exp = payload.get("exp")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    # Verify the user still exists (prevents deleted users from refreshing)
    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")

    # If jti present, ensure it hasn't been revoked already
    if jti:
        stmt = select(RevokedToken).where(RevokedToken.refresh_token_jti == jti)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Rotation: mark the old refresh token JTI as revoked so it cannot be replayed
    if jti and exp:
        try:
            # exp can be timestamp (int) or datetime; coerce to datetime
            if isinstance(exp, (int, float)):
                expires_at = datetime.fromtimestamp(int(exp), timezone.utc)
            else:
                expires_at = exp if isinstance(exp, datetime) else datetime.fromtimestamp(int(exp), timezone.utc)
        except Exception:
            expires_at = datetime.now(timezone.utc)

        revoked = RevokedToken(refresh_token_jti=jti, user_id=user_id, expires_at=expires_at)
        db.add(revoked)
        try:
            await db.commit()
        except Exception:
            # Integrity error means another request may have revoked it concurrently
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    return _build_token_response(user_id)


@router.post("/revoke", response_model=MessageResponse)
async def revoke(data: RefreshRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    """Revoke (logout) a refresh token by recording its JTI in the revoked_tokens table."""
    try:
        payload = decode_token(data.refresh_token)
        ensure_token_type(payload, TokenType.REFRESH)
        jti = payload.get("jti")
        user_id = UUID(payload.get("sub"))
        exp = payload.get("exp")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if not jti:
        return MessageResponse(message="Token revoked")

    try:
        if isinstance(exp, (int, float)):
            expires_at = datetime.fromtimestamp(int(exp), timezone.utc)
        else:
            expires_at = exp if isinstance(exp, datetime) else datetime.fromtimestamp(int(exp), timezone.utc)
    except Exception:
        expires_at = datetime.now(timezone.utc)

    revoked = RevokedToken(refresh_token_jti=jti, user_id=user_id, expires_at=expires_at)
    db.add(revoked)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return MessageResponse(message="Token revoked")


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
