from __future__ import annotations

import base64
import binascii
import hashlib
import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User, UserImage
from app.db.session import get_db
from app.schemas.user_image import UserImageOut, UserImageUploadFile, UserImageUploadUrl
from app.schemas.common import DeleteResponse

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post(
    "/images/upload", response_model=UserImageOut, status_code=status.HTTP_201_CREATED
)
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
        source=data.source,
    )
    db.add(user_image)
    await db.commit()
    await db.refresh(user_image)
    return user_image  # type: ignore[return-value]


@router.post(
    "/images/upload-file",
    response_model=UserImageOut,
    status_code=status.HTTP_201_CREATED,
)
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
            prefix = data_uri_parts[0]  # e.g. "data:image/png;base64"
            base64_data = data_uri_parts[1]

            # Validate MIME type from the data URI prefix
            if prefix.startswith("data:"):
                mime_type = prefix[5:].split(";")[0].strip().lower()
                if mime_type not in _ALLOWED_MIME_TYPES:
                    raise HTTPException(
                        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                        detail=f"Unsupported image type '{mime_type}'. Allowed: {', '.join(sorted(_ALLOWED_MIME_TYPES))}",
                    )
        else:
            base64_data = data.data

        # Decode to verify it's valid base64
        image_bytes = base64.b64decode(base64_data)

        # Enforce maximum file size
        if len(image_bytes) > _MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image too large: {len(image_bytes)} bytes. Maximum allowed is {_MAX_IMAGE_BYTES} bytes (10 MB).",
            )

        # Verify size matches
        if len(image_bytes) != data.size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Size mismatch: declared {data.size} bytes, actual {len(image_bytes)} bytes",
            )

        # TODO: Upload to cloud storage (S3, GCS) instead of storing base64 in DB
        # Currently stores the data URI directly (not recommended for production)
        url = (
            data.data
            if data.data.startswith("data:")
            else f"data:image/jpeg;base64,{base64_data}"
        )

        user_image = UserImage(
            user_id=current_user.id,
            url=url,
            filename=data.filename,
            size=data.size,
            source=data.source,
        )
        db.add(user_image)
        await db.commit()
        await db.refresh(user_image)
        return user_image  # type: ignore[return-value]

    except HTTPException:
        raise
    except binascii.Error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid base64 data"
        )
    except Exception as e:
        logger.error("Failed to process image upload: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to process image. Please ensure the file is a valid image and try again.",
        )


@router.get("/images", response_model=List[UserImageOut])
async def list_images(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[UserImageOut]:
    """List all images for the current user."""
    stmt = (
        select(UserImage)
        .where(UserImage.user_id == current_user.id, UserImage.source == "library")
        .order_by(UserImage.created_at.desc())
    )

    result = await db.execute(stmt)
    return result.scalars().all()  # type: ignore[return-value]


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
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found"
        )

    return image  # type: ignore[return-value]


@router.delete(
    "/images/{image_id}", response_model=DeleteResponse, status_code=status.HTTP_200_OK
)
async def delete_image(
    image_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeleteResponse:
    """Delete an image."""
    stmt = select(UserImage).where(
        UserImage.id == image_id,
        UserImage.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found"
        )

    # In production, you would also delete from cloud storage here
    await db.delete(image)
    await db.commit()
    return DeleteResponse()
