from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.core.errors import AppError, ErrorCodes
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_active_entitlement
from app.db.models import Post, User
from app.db.session import get_db
from app.schemas.post import GenderEnum, PostCreate, PostOut, PostUpdate
from app.schemas.common import DeleteResponse, ErrorResponse

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
}

router = APIRouter(responses=_ERROR_RESPONSES, dependencies=[Depends(require_active_entitlement)])


@router.post("/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostOut:
    """Create a new birthday post."""
    # Check unique label per user (if label provided)
    if data.label:
        dup_stmt = select(Post).where(
            Post.user_id == current_user.id,
            Post.label == data.label,
        )
        dup_result = await db.execute(dup_stmt)
        if dup_result.scalar_one_or_none():
            raise AppError(
                status.HTTP_409_CONFLICT,
                ErrorCodes.CONFLICT,
                "A post with this label already exists",
            )
    post = Post(
        user_id=current_user.id,
        content=data.content,
        gender=data.gender.value,
        image_url=data.image_url,
        label=data.label,
        is_default=False,
        font_family=data.font_family,
        font_size=data.font_size,
        font_color=data.font_color,
        group_id=data.group_id,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post  # type: ignore[return-value]


@router.get("/posts", response_model=List[PostOut])
async def list_posts(
    gender: GenderEnum | None = None,
    group_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[PostOut]:
    """List all posts for the current user."""
    stmt = select(Post).where(Post.user_id == current_user.id)

    if gender:
        stmt = stmt.where(Post.gender == gender.value)
    if group_id is not None:
        stmt = stmt.where(Post.group_id == group_id)

    stmt = stmt.order_by(Post.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()  # type: ignore[return-value]


@router.get("/posts/{post_id}", response_model=PostOut)
async def get_post(
    post_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostOut:
    """Get a specific post by ID."""
    stmt = select(Post).where(
        Post.id == post_id,
        Post.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()

    if not post:
        raise AppError(
            status.HTTP_404_NOT_FOUND, ErrorCodes.POST_NOT_FOUND, "Post not found"
        )

    return post  # type: ignore[return-value]


@router.put("/posts/{post_id}", response_model=PostOut)
async def update_post(
    post_id: UUID,
    data: PostUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostOut:
    """Update a post."""
    stmt = select(Post).where(
        Post.id == post_id,
        Post.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()

    if not post:
        raise AppError(
            status.HTTP_404_NOT_FOUND, ErrorCodes.POST_NOT_FOUND, "Post not found"
        )

    if data.content is not None:
        post.content = data.content
    if data.gender is not None:
        post.gender = data.gender.value
    if data.image_url is not None:
        post.image_url = data.image_url
    if data.font_family is not None:
        post.font_family = data.font_family
    if data.font_size is not None:
        post.font_size = data.font_size
    if data.font_color is not None:
        post.font_color = data.font_color
    if data.group_id is not None:
        post.group_id = data.group_id

    # Check unique label if being changed
    if data.label is not None and data.label != post.label and data.label:
        dup_stmt = select(Post).where(
            Post.user_id == current_user.id,
            Post.label == data.label,
            Post.id != post_id,
        )
        dup_result = await db.execute(dup_stmt)
        if dup_result.scalar_one_or_none():
            raise AppError(
                status.HTTP_409_CONFLICT,
                ErrorCodes.CONFLICT,
                "A post with this label already exists",
            )
    if data.label is not None:
        post.label = data.label

    post.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(post)
    return post  # type: ignore[return-value]


@router.delete(
    "/posts/{post_id}", response_model=DeleteResponse, status_code=status.HTTP_200_OK
)
async def delete_post(
    post_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeleteResponse:
    """Delete a post."""
    stmt = select(Post).where(
        Post.id == post_id,
        Post.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    post = result.scalar_one_or_none()

    if not post:
        raise AppError(
            status.HTTP_404_NOT_FOUND, ErrorCodes.POST_NOT_FOUND, "Post not found"
        )

    await db.delete(post)
    await db.commit()
    return DeleteResponse()
