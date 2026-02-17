from __future__ import annotations

import base64
import hashlib
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User, UserImage
from app.db.session import get_db
from app.schemas.user_image import UserImageOut, UserImageUploadFile, UserImageUploadUrl

router = APIRouter()


@router.post("/images/upload", response_model=UserImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image_from_url(
    data: UserImageUploadUrl,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserImageOut:
    """Upload an image from a URL."""
    # Extract filename from URL
    filename = data.url.split("/")[-1].split("?")[0]
    if not filename:
        filename = f"image_{hashlib.md5(data.url.encode()).hexdigest()[:8]}.jpg"
    
    # For now, we just store the URL directly
    # In production, you might want to download and re-host the image
    user_image = UserImage(
        user_id=current_user.id,
        url=data.url,
        filename=filename,
        size=0,  # Unknown size for URL uploads
    )
    db.add(user_image)
    await db.commit()
    await db.refresh(user_image)
    return user_image


@router.post("/images/upload-file", response_model=UserImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image_file(
    data: UserImageUploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserImageOut:
    """Upload an image file (base64 encoded)."""
    try:
        # Validate base64 data
        if "," in data.data:
            # Strip data URI prefix if present (e.g., "data:image/png;base64,")
            data_uri_parts = data.data.split(",", 1)
            base64_data = data_uri_parts[1]
        else:
            base64_data = data.data
        
        # Decode to verify it's valid base64
        image_bytes = base64.b64decode(base64_data)
        
        # Verify size matches
        if len(image_bytes) != data.size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Size mismatch: declared {data.size} bytes, actual {len(image_bytes)} bytes"
            )
        
        # In production, you would:
        # 1. Upload to cloud storage (S3, GCS, etc.)
        # 2. Get the public URL
        # 3. Store that URL
        # For now, we'll store the data URI directly (not recommended for production)
        url = data.data if data.data.startswith("data:") else f"data:image/jpeg;base64,{base64_data}"
        
        user_image = UserImage(
            user_id=current_user.id,
            url=url,
            filename=data.filename,
            size=data.size,
        )
        db.add(user_image)
        await db.commit()
        await db.refresh(user_image)
        return user_image
        
    except base64.binascii.Error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 data"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process image: {str(e)}"
        )


@router.get("/images", response_model=List[UserImageOut])
async def list_images(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[UserImageOut]:
    """List all images for the current user."""
    stmt = select(UserImage).where(
        UserImage.user_id == current_user.id
    ).order_by(UserImage.uploaded_at.desc())
    
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/images/{image_id}", response_model=UserImageOut)
async def get_image(
    image_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserImageOut:
    """Get a specific image by ID."""
    stmt = select(UserImage).where(
        UserImage.id == image_id,
        UserImage.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()
    
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    return image


@router.delete("/images/{image_id}", status_code=status.HTTP_200_OK)
async def delete_image(
    image_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete an image."""
    stmt = select(UserImage).where(
        UserImage.id == image_id,
        UserImage.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()
    
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    # In production, you would also delete from cloud storage here
    await db.delete(image)
    await db.commit()
    return {"status": "deleted"}
