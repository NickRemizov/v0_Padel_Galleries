"""
Image Upload Router

Handles file uploads to MinIO storage.
- POST /upload - Direct upload (legacy, requires auth)
- GET /presign - Get presigned URL for direct MinIO upload (requires auth)
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel

from core.responses import ApiResponse
from core.logging import get_logger
from infrastructure.minio_storage import get_minio_storage

logger = get_logger(__name__)
router = APIRouter()


class PresignRequest(BaseModel):
    """Request for batch presigned URLs."""
    filenames: List[str]
    folder: str = "photos"  # "photos", "covers", or "avatars"


@router.post("/presign")
async def get_presigned_urls(request: PresignRequest):
    """
    Get presigned URLs for direct upload to MinIO.

    Args:
        filenames: List of filenames
        folder: Target folder - "photos" (default), "covers", or "avatars"

    Returns list of {upload_url, object_name, public_url} for each filename.
    URLs expire in 60 seconds.
    """
    if not request.filenames:
        raise HTTPException(400, "No filenames provided")

    if len(request.filenames) > 100:
        raise HTTPException(400, "Max 100 files per request")

    # Validate folder
    allowed_folders = ["photos", "covers", "avatars"]
    folder = request.folder if request.folder in allowed_folders else "photos"

    minio = get_minio_storage()
    results = []

    for filename in request.filenames:
        try:
            result = minio.generate_presigned_upload_url(filename, folder=folder, expires_seconds=60)
            results.append({
                "filename": filename,
                **result
            })
        except Exception as e:
            logger.error(f"Presign error for {filename}: {e}")
            results.append({
                "filename": filename,
                "error": str(e)
            })

    return ApiResponse.ok(results)


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """
    Upload image to MinIO storage.

    Returns:
        url: Public URL of uploaded file
        object_name: MinIO object name (clean UUID)
        original_filename: Original filename from upload
        size: File size in bytes
        content_type: MIME type
    """
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"]
    content_type = file.content_type or "image/jpeg"

    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Allowed: {', '.join(allowed_types)}"
        )

    try:
        # Read file data
        file_data = await file.read()

        if not file_data:
            raise HTTPException(status_code=400, detail="Empty file")

        # Get original filename
        original_filename = file.filename or "image.jpg"

        # Upload to MinIO
        minio = get_minio_storage()
        result = minio.upload_file(
            file_data=file_data,
            filename=original_filename,
            content_type=content_type
        )

        logger.info(f"Uploaded: {original_filename} -> {result['object_name']}")

        return ApiResponse.ok({
            "url": result["url"],
            "object_name": result["object_name"],
            "original_filename": original_filename,
            "size": result["size"],
            "content_type": content_type
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
