"""
Photo Faces Router

User operations on their photo faces (verify, reject, hide, unhide).

v2.0: Variant C architecture
- verify/reject use update_face_metadata (face already in index)
- hide/unhide do NOT sync index (hidden_by_user is display-only, not recognition-related)
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends

from core.logging import get_logger
from core.responses import ApiResponse
from infrastructure.supabase import get_supabase_client
from services.face_recognition import FaceRecognitionService

logger = get_logger(__name__)
router = APIRouter()


def get_face_service():
    """Dependency to get FaceRecognitionService instance."""
    return FaceRecognitionService(get_supabase_client())


# =============================================================================
# Helper Functions
# =============================================================================

def get_photo_face_with_image(db, photo_face_id: str) -> dict:
    """
    Get photo_face with related gallery_image data.
    Returns photo_face dict or raises HTTPException.
    """
    result = db.table("photo_faces").select(
        "id, person_id, photo_id, verified, hidden_by_user"
    ).eq("id", photo_face_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Photo face not found")

    photo_face = result.data[0]

    # Get gallery_image info for logging
    if photo_face.get("photo_id"):
        img_result = db.table("gallery_images").select(
            "id, original_filename, gallery_id"
        ).eq("id", photo_face["photo_id"]).execute()
        if img_result.data:
            photo_face["gallery_image"] = img_result.data[0]
            # Get gallery title
            gallery_result = db.table("galleries").select("title").eq(
                "id", img_result.data[0]["gallery_id"]
            ).execute()
            if gallery_result.data:
                photo_face["gallery_title"] = gallery_result.data[0]["title"]

    return photo_face


def log_user_activity(db, person_id: str, activity_type: str, image_id: str, gallery_id: str, metadata: dict) -> None:
    """Log to user_activity table (fire-and-forget)."""
    try:
        db.table("user_activity").insert({
            "person_id": person_id,
            "activity_type": activity_type,
            "image_id": image_id,
            "gallery_id": gallery_id,
            "metadata": metadata,
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to log user activity: {e}")


def log_admin_activity(db, event_type: str, user_id: str, person_id: str, metadata: dict) -> None:
    """Log to admin_activity table (fire-and-forget)."""
    try:
        db.table("admin_activity").insert({
            "event_type": event_type,
            "user_id": user_id,
            "person_id": person_id,
            "metadata": metadata,
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to log admin activity: {e}")


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/photo-faces/{photo_face_id}/verify")
async def verify_photo_face(
    photo_face_id: str,
    person_id: str = Query(..., description="Person ID from cookie"),
    user_id: Optional[str] = Query(None, description="User ID for logging"),
    face_service: FaceRecognitionService = Depends(get_face_service),
) -> dict:
    """
    Verify that this photo face is the user.
    Sets verified=true and recognition_confidence=1.0.
    """
    db = get_supabase_client().client

    photo_face = get_photo_face_with_image(db, photo_face_id)

    # Check ownership
    if photo_face.get("person_id") != person_id:
        raise HTTPException(status_code=403, detail="Cannot verify other person's photos")

    # Update - set verified=true AND recognition_confidence=1.0
    db.table("photo_faces").update({
        "verified": True,
        "recognition_confidence": 1.0,  # Fix #5: verified faces always have confidence 1.0
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", photo_face_id).execute()

    logger.info(f"User {user_id or 'unknown'} verified photo_face {photo_face_id}")

    # v2.0: Update index metadata (face already in index from Variant C)
    try:
        idx_result = await face_service.update_face_metadata(
            photo_face_id,
            verified=True,
            confidence=1.0
        )
        logger.info(f"Index sync (verify): {idx_result}")
    except Exception as idx_err:
        logger.error(f"Failed to update index metadata on verify: {idx_err}")

    # Log activities
    gi = photo_face.get("gallery_image", {})
    metadata = {
        "filename": gi.get("original_filename"),
        "gallery_title": photo_face.get("gallery_title"),
    }

    log_user_activity(db, person_id, "photo_verified", gi.get("id"), gi.get("gallery_id"), metadata)

    if user_id:
        log_admin_activity(db, "photo_verified", user_id, person_id, metadata)

    return ApiResponse.ok({"verified": True}).model_dump()


@router.post("/photo-faces/{photo_face_id}/reject")
async def reject_photo_face(
    photo_face_id: str,
    person_id: str = Query(..., description="Person ID from cookie"),
    user_id: Optional[str] = Query(None, description="User ID for logging"),
    face_service: FaceRecognitionService = Depends(get_face_service),
) -> dict:
    """
    Reject photo face - "this is not me".
    Removes person_id link, resets verified, hidden_by_user, and recognition_confidence.
    """
    db = get_supabase_client().client

    photo_face = get_photo_face_with_image(db, photo_face_id)

    # Check ownership
    if photo_face.get("person_id") != person_id:
        raise HTTPException(status_code=403, detail="Cannot reject other person's photos")

    # Log BEFORE removing person_id
    gi = photo_face.get("gallery_image", {})
    metadata = {
        "filename": gi.get("original_filename"),
        "gallery_title": photo_face.get("gallery_title"),
    }

    log_user_activity(db, person_id, "photo_rejected", gi.get("id"), gi.get("gallery_id"), metadata)

    if user_id:
        log_admin_activity(db, "photo_rejected", user_id, person_id, metadata)

    # Remove person link and reset confidence
    db.table("photo_faces").update({
        "person_id": None,
        "verified": False,
        "hidden_by_user": False,
        "recognition_confidence": None,  # Reset confidence when rejected
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", photo_face_id).execute()

    logger.info(f"User {user_id or 'unknown'} rejected photo_face {photo_face_id} (removed person_id)")

    # v2.0: Update index metadata - set person_id to None (face stays in index)
    # Empty string "" signals to update_metadata to set person_id to None
    try:
        idx_result = await face_service.update_face_metadata(
            photo_face_id,
            person_id="",  # Special value: set to None
            verified=False,
            confidence=0.0
        )
        logger.info(f"Index sync (reject): {idx_result}")
    except Exception as idx_err:
        logger.error(f"Failed to update index metadata on reject: {idx_err}")

    return ApiResponse.ok({"rejected": True}).model_dump()


@router.post("/photo-faces/{photo_face_id}/hide")
async def hide_photo_face(
    photo_face_id: str,
    person_id: str = Query(..., description="Person ID from cookie"),
    user_id: Optional[str] = Query(None, description="User ID for logging"),
) -> dict:
    """
    Hide photo from public galleries.
    Only allowed if user is the only person on the photo.

    v2.0: Does NOT affect HNSW index. hidden_by_user is display-only.
    Hidden photos are still used for recognition ("это я, но не показывать").
    """
    db = get_supabase_client().client

    photo_face = get_photo_face_with_image(db, photo_face_id)

    # Check ownership
    if photo_face.get("person_id") != person_id:
        raise HTTPException(status_code=403, detail="Cannot hide other person's photos")

    # Check if this person is the only one on the photo
    count_result = db.table("photo_faces").select(
        "id", count="exact"
    ).eq("photo_id", photo_face["photo_id"]).not_.is_("person_id", "null").execute()

    if count_result.count and count_result.count > 1:
        raise HTTPException(status_code=400, detail="Cannot hide photo with multiple people")

    # Hide
    db.table("photo_faces").update({
        "hidden_by_user": True,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", photo_face_id).execute()

    logger.info(f"User {user_id or 'unknown'} hid photo_face {photo_face_id}")

    # v2.0: NO index sync - hidden_by_user does not affect recognition
    # Hidden photo means "это я, но не показывать" - still used for recognition

    # Log activity
    gi = photo_face.get("gallery_image", {})
    metadata = {
        "filename": gi.get("original_filename"),
        "gallery_title": photo_face.get("gallery_title"),
    }

    log_user_activity(db, person_id, "photo_hidden", gi.get("id"), gi.get("gallery_id"), metadata)

    return ApiResponse.ok({"hidden": True}).model_dump()


@router.post("/photo-faces/{photo_face_id}/unhide")
async def unhide_photo_face(
    photo_face_id: str,
    person_id: str = Query(..., description="Person ID from cookie"),
    user_id: Optional[str] = Query(None, description="User ID for logging"),
) -> dict:
    """
    Unhide photo - show in public galleries again.

    v2.0: Does NOT affect HNSW index. hidden_by_user is display-only.
    """
    db = get_supabase_client().client

    photo_face = get_photo_face_with_image(db, photo_face_id)

    # Check ownership
    if photo_face.get("person_id") != person_id:
        raise HTTPException(status_code=403, detail="Cannot unhide other person's photos")

    # Unhide
    db.table("photo_faces").update({
        "hidden_by_user": False,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", photo_face_id).execute()

    logger.info(f"User {user_id or 'unknown'} unhid photo_face {photo_face_id}")

    # v2.0: NO index sync - hidden_by_user does not affect recognition

    # Log activity
    gi = photo_face.get("gallery_image", {})
    metadata = {
        "filename": gi.get("original_filename"),
        "gallery_title": photo_face.get("gallery_title"),
    }

    log_user_activity(db, person_id, "photo_unhidden", gi.get("id"), gi.get("gallery_id"), metadata)

    return ApiResponse.ok({"hidden": False}).model_dump()
