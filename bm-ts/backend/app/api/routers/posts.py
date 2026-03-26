from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import Post, User
from app.db.session import get_db
from app.schemas.post import GenderEnum, PostCreate, PostOut, PostUpdate
from app.schemas.common import DeleteResponse

router = APIRouter()


@router.post("/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostOut:
    """Create a new birthday post."""
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
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


@router.get("/posts", response_model=List[PostOut])
async def list_posts(
    gender: GenderEnum | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[PostOut]:
    """List all posts for the current user."""
    stmt = select(Post).where(Post.user_id == current_user.id)
    
    if gender:
        stmt = stmt.where(Post.gender == gender.value)
    
    stmt = stmt.order_by(Post.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found"
        )
    
    return post


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found"
        )
    
    if data.content is not None:
        post.content = data.content
    if data.gender is not None:
        post.gender = data.gender.value
    if data.image_url is not None:
        post.image_url = data.image_url
    if data.label is not None:
        post.label = data.label
    
    post.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(post)
    return post


@router.delete("/posts/{post_id}", response_model=DeleteResponse, status_code=status.HTTP_200_OK)
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found"
        )
    
    await db.delete(post)
    await db.commit()
    return DeleteResponse()
