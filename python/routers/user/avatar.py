"""
User Avatar Router
Allows users to update their own avatar.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from uuid import UUID

from core.responses import ApiResponse
from core.logging import get_logger
from core.slug import to_slug
from infrastructure.minio_storage import get_minio_storage


def get_supabase_client():
    """Get global supabase client instance."""
    from main import supabase_service
    return supabase_service.client

logger = get_logger(__name__)
router = APIRouter()


@router.post("/avatar")
async def update_user_avatar(
    person_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Update user's avatar.

    Security: person_id is verified by Next.js API from telegram_user cookie.

    Process:
    1. Verify person exists
    2. Delete old avatar from MinIO (if exists)
    3. Upload new avatar
    4. Update person.avatar_url

    Args:
        person_id: UUID of the person (verified by caller)
        file: Cropped avatar image (JPEG)

    Returns:
        New avatar URL
    """
    supabase = get_supabase_client()
    minio = get_minio_storage()

    try:
        # Validate person_id format
        try:
            UUID(person_id)
        except ValueError:
            raise HTTPException(400, "Invalid person_id format")

        # Get person data (including current avatar)
        result = supabase.table("people").select(
            "id, real_name, avatar_url"
        ).eq("id", person_id).execute()

        if not result.data:
            raise HTTPException(404, "Person not found")

        person = result.data[0]
        old_avatar_url = person.get("avatar_url")
        person_name = person.get("real_name") or "user"

        # Validate file type
        content_type = file.content_type or "image/jpeg"
        if content_type not in ["image/jpeg", "image/png", "image/webp"]:
            raise HTTPException(400, f"Invalid file type: {content_type}")

        # Read file
        file_data = await file.read()
        if not file_data:
            raise HTTPException(400, "Empty file")

        # Limit file size (2MB for avatar)
        if len(file_data) > 2 * 1024 * 1024:
            raise HTTPException(400, "Avatar too large (max 2MB)")

        # Delete old avatar from MinIO (if exists and is our storage)
        if old_avatar_url and "vlcpadel.com/storage/avatars" in old_avatar_url:
            try:
                deleted = minio.delete_file(old_avatar_url)
                if deleted:
                    logger.info(f"Deleted old avatar: {old_avatar_url}")
            except Exception as e:
                # Don't fail if old avatar deletion fails
                logger.warning(f"Failed to delete old avatar: {e}")

        # Generate filename: {slug}_avatar.jpg
        slug = to_slug(person_name, max_length=50) or "user"
        filename = f"{slug}_avatar.jpg"

        # Upload new avatar
        upload_result = minio.upload_file(
            file_data=file_data,
            filename=filename,
            content_type="image/jpeg",
            folder="avatars"
        )

        new_avatar_url = upload_result["url"]

        # Update person.avatar_url
        supabase.table("people").update({
            "avatar_url": new_avatar_url
        }).eq("id", person_id).execute()

        logger.info(f"Updated avatar for person {person_id}: {new_avatar_url}")

        return ApiResponse.ok({
            "avatar_url": new_avatar_url,
            "old_avatar_deleted": old_avatar_url is not None
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Avatar update error: {e}")
        raise HTTPException(500, f"Failed to update avatar: {str(e)}")
