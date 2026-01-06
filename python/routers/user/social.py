"""
Social Features Router

Likes, comments, favorites, downloads for users.
"""

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.logging import get_logger
from core.responses import ApiResponse
from infrastructure.supabase import get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


# =============================================================================
# Schemas
# =============================================================================

class CommentCreate(BaseModel):
    content: str


class CommentUpdate(BaseModel):
    content: str


# =============================================================================
# LIKES
# =============================================================================

@router.get("/images/{image_id}/likes")
async def get_likes(
    image_id: str,
    user_id: Optional[str] = Query(None, description="User ID to check if liked"),
) -> dict:
    """
    Get likes count for an image and whether user liked it.
    """
    db = get_supabase_client().client

    # Get total count
    count_result = db.table("likes").select("id", count="exact").eq("image_id", image_id).execute()
    count = count_result.count or 0

    # Check if user liked
    is_liked = False
    if user_id:
        user_like = db.table("likes").select("id").eq("image_id", image_id).eq("user_id", user_id).execute()
        is_liked = len(user_like.data) > 0

    return ApiResponse.ok({"count": count, "isLiked": is_liked}).model_dump()


@router.post("/images/{image_id}/likes/toggle")
async def toggle_like(
    image_id: str,
    user_id: str = Query(..., description="User ID"),
) -> dict:
    """
    Toggle like for an image.
    """
    db = get_supabase_client().client

    # Check existing like
    existing = db.table("likes").select("id").eq("image_id", image_id).eq("user_id", user_id).execute()

    if existing.data:
        # Unlike
        db.table("likes").delete().eq("id", existing.data[0]["id"]).execute()
        is_liked = False
    else:
        # Like
        db.table("likes").insert({
            "image_id": image_id,
            "user_id": user_id,
        }).execute()
        is_liked = True

    # Get updated count
    count_result = db.table("likes").select("id", count="exact").eq("image_id", image_id).execute()
    count = count_result.count or 0

    return ApiResponse.ok({"count": count, "isLiked": is_liked}).model_dump()


# =============================================================================
# COMMENTS
# =============================================================================

@router.get("/images/{image_id}/comments")
async def get_comments(image_id: str) -> dict:
    """
    Get all comments for an image with user info.
    """
    db = get_supabase_client().client

    # Get comments
    comments_result = db.table("comments").select(
        "id, content, created_at, updated_at, user_id, gallery_image_id"
    ).eq("gallery_image_id", image_id).order("created_at", desc=False).execute()

    comments = comments_result.data or []

    # Get user info for each comment
    user_ids = list(set(c["user_id"] for c in comments if c.get("user_id")))
    users_map = {}

    if user_ids:
        users_result = db.table("users").select(
            "id, telegram_id, username, first_name, last_name, photo_url"
        ).in_("id", user_ids).execute()
        users_map = {u["id"]: u for u in (users_result.data or [])}

    # Attach user info to comments
    for comment in comments:
        comment["users"] = users_map.get(comment["user_id"])

    return ApiResponse.ok({"comments": comments}).model_dump()


@router.post("/images/{image_id}/comments")
async def create_comment(
    image_id: str,
    data: CommentCreate,
    user_id: str = Query(..., description="User ID"),
) -> dict:
    """
    Add a new comment to an image.
    """
    content = data.content.strip()

    if not content:
        raise HTTPException(status_code=400, detail="Comment content is required")

    if len(content) > 256:
        raise HTTPException(status_code=400, detail="Comment is too long (max 256 characters)")

    db = get_supabase_client().client

    # Insert comment
    db.table("comments").insert({
        "gallery_image_id": image_id,
        "user_id": user_id,
        "content": content,
    }).execute()

    # Get the created comment with user info
    comment_result = db.table("comments").select(
        "id, content, created_at, updated_at, user_id, gallery_image_id"
    ).eq("gallery_image_id", image_id).eq("user_id", user_id).order(
        "created_at", desc=True
    ).limit(1).execute()

    if not comment_result.data:
        raise HTTPException(status_code=500, detail="Failed to create comment")

    comment = comment_result.data[0]

    # Get user info
    user_result = db.table("users").select(
        "id, telegram_id, username, first_name, last_name, photo_url"
    ).eq("id", user_id).execute()

    comment["users"] = user_result.data[0] if user_result.data else None

    return ApiResponse.ok({"comment": comment}).model_dump()


@router.patch("/comments/{comment_id}")
async def update_comment(
    comment_id: str,
    data: CommentUpdate,
    user_id: str = Query(..., description="User ID"),
) -> dict:
    """
    Edit a comment (author only).
    """
    content = data.content.strip()

    if not content:
        raise HTTPException(status_code=400, detail="Comment content is required")

    if len(content) > 256:
        raise HTTPException(status_code=400, detail="Comment is too long (max 256 characters)")

    db = get_supabase_client().client

    # Check ownership
    comment_result = db.table("comments").select("user_id").eq("id", comment_id).execute()

    if not comment_result.data:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment_result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Update
    db.table("comments").update({
        "content": content,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", comment_id).execute()

    # Get updated comment
    updated_result = db.table("comments").select(
        "id, content, created_at, updated_at, user_id, gallery_image_id"
    ).eq("id", comment_id).execute()

    comment = updated_result.data[0] if updated_result.data else None

    if comment:
        user_result = db.table("users").select(
            "id, telegram_id, username, first_name, last_name, photo_url"
        ).eq("id", user_id).execute()
        comment["users"] = user_result.data[0] if user_result.data else None

    return ApiResponse.ok({"comment": comment}).model_dump()


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    user_id: Optional[str] = Query(None, description="User ID"),
    is_admin: bool = Query(False, description="Is admin request"),
    admin_role: Optional[str] = Query(None, description="Admin role"),
    admin_id: Optional[str] = Query(None, description="Admin ID"),
) -> dict:
    """
    Delete a comment (author or admin).
    """
    db = get_supabase_client().client

    # Get comment with gallery info
    comment_result = db.table("comments").select(
        "id, user_id, gallery_image_id"
    ).eq("id", comment_id).execute()

    if not comment_result.data:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment = comment_result.data[0]

    # Check permissions
    can_delete = False

    # Admin check
    if is_admin and admin_role:
        if admin_role in ["owner", "global_admin"]:
            can_delete = True
        elif admin_role == "local_admin" and admin_id:
            # Check if admin owns the gallery
            image_result = db.table("gallery_images").select(
                "gallery_id"
            ).eq("id", comment["gallery_image_id"]).execute()

            if image_result.data:
                gallery_result = db.table("galleries").select(
                    "created_by"
                ).eq("id", image_result.data[0]["gallery_id"]).execute()

                if gallery_result.data and gallery_result.data[0]["created_by"] == admin_id:
                    can_delete = True

    # User check (author)
    if not can_delete and user_id and comment["user_id"] == user_id:
        can_delete = True

    if not can_delete:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Delete
    db.table("comments").delete().eq("id", comment_id).execute()

    return ApiResponse.ok({"success": True}).model_dump()


# =============================================================================
# FAVORITES
# =============================================================================

@router.get("/favorites")
async def get_favorites(
    user_id: str = Query(..., description="User ID"),
) -> dict:
    """
    Get all favorites for a user with image info.
    """
    db = get_supabase_client().client

    # Get favorites
    favorites_result = db.table("favorites").select(
        "id, user_id, gallery_image_id, created_at"
    ).eq("user_id", user_id).order("created_at", desc=True).execute()

    favorites = favorites_result.data or []

    # Get image info
    image_ids = [f["gallery_image_id"] for f in favorites if f.get("gallery_image_id")]

    if image_ids:
        images_result = db.table("gallery_images").select(
            "id, gallery_id, image_url, original_url, original_filename, file_size, width, height, created_at"
        ).in_("id", image_ids).execute()

        images_map = {img["id"]: img for img in (images_result.data or [])}

        for fav in favorites:
            fav["gallery_images"] = images_map.get(fav["gallery_image_id"])

    return ApiResponse.ok({"favorites": favorites}).model_dump()


@router.get("/images/{image_id}/favorite")
async def check_favorite(
    image_id: str,
    user_id: Optional[str] = Query(None, description="User ID"),
) -> dict:
    """
    Check if image is favorited by user.
    """
    if not user_id:
        return ApiResponse.ok({"isFavorited": False}).model_dump()

    db = get_supabase_client().client

    result = db.table("favorites").select("id").eq(
        "user_id", user_id
    ).eq("gallery_image_id", image_id).execute()

    return ApiResponse.ok({"isFavorited": len(result.data) > 0}).model_dump()


@router.post("/images/{image_id}/favorite/toggle")
async def toggle_favorite(
    image_id: str,
    user_id: str = Query(..., description="User ID"),
) -> dict:
    """
    Toggle favorite for an image.
    """
    db = get_supabase_client().client

    # Check existing
    existing = db.table("favorites").select("id").eq(
        "user_id", user_id
    ).eq("gallery_image_id", image_id).execute()

    if existing.data:
        # Remove
        db.table("favorites").delete().eq("id", existing.data[0]["id"]).execute()
        is_favorited = False
    else:
        # Add
        db.table("favorites").insert({
            "user_id": user_id,
            "gallery_image_id": image_id,
        }).execute()
        is_favorited = True

    return ApiResponse.ok({"isFavorited": is_favorited}).model_dump()


# =============================================================================
# DOWNLOADS
# =============================================================================

@router.post("/images/{image_id}/download")
async def increment_download(image_id: str) -> dict:
    """
    Increment download count for an image.
    Calls the database RPC function.
    """
    db = get_supabase_client().client

    try:
        db.rpc("increment_download_count", {"image_id": image_id}).execute()
    except Exception as e:
        logger.error(f"Error incrementing download count: {e}")
        raise HTTPException(status_code=500, detail="Failed to increment download count")

    return ApiResponse.ok({"success": True}).model_dump()


# =============================================================================
# MY PHOTOS (for /my-photos page)
# =============================================================================

@router.get("/my-photos")
async def get_my_photos(
    person_id: str = Query(..., description="Person ID"),
) -> dict:
    """
    Get all photos where person is tagged, with faces count.
    For /my-photos page.
    """
    db = get_supabase_client().client

    # Get all photo_faces for this person
    photo_faces_result = db.table("photo_faces").select(
        "id, photo_id, person_id, recognition_confidence, verified, hidden_by_user, insightface_bbox"
    ).eq("person_id", person_id).order(
        "verified", desc=False  # Unverified first
    ).order(
        "recognition_confidence", desc=False  # Low confidence first
    ).execute()

    photo_faces = photo_faces_result.data or []

    if not photo_faces:
        return ApiResponse.ok({"photo_faces": []}).model_dump()

    # Get unique photo_ids
    photo_ids = list(set(pf["photo_id"] for pf in photo_faces if pf.get("photo_id")))

    # Get gallery_images for these photos
    images_result = db.table("gallery_images").select(
        "id, slug, gallery_id, image_url, original_url, original_filename, width, height"
    ).in_("id", photo_ids).execute()

    images_map = {img["id"]: img for img in (images_result.data or [])}

    # Get galleries info
    gallery_ids = list(set(img["gallery_id"] for img in (images_result.data or []) if img.get("gallery_id")))

    galleries_map = {}
    if gallery_ids:
        galleries_result = db.table("galleries").select(
            "id, slug, title, shoot_date, is_public"
        ).in_("id", gallery_ids).execute()
        galleries_map = {g["id"]: g for g in (galleries_result.data or [])}

    # Count faces per photo (all people, not just current user)
    faces_count_result = db.table("photo_faces").select(
        "photo_id"
    ).in_("photo_id", photo_ids).not_.is_("person_id", "null").execute()

    faces_count_map: dict = {}
    for face in (faces_count_result.data or []):
        pid = face["photo_id"]
        faces_count_map[pid] = faces_count_map.get(pid, 0) + 1

    # Assemble response
    for pf in photo_faces:
        photo_id = pf.get("photo_id")
        image = images_map.get(photo_id, {})
        gallery = galleries_map.get(image.get("gallery_id"), {})

        pf["gallery_images"] = {
            **image,
            "galleries": gallery
        } if image else None
        pf["faces_count"] = faces_count_map.get(photo_id, 1)

    return ApiResponse.ok({"photo_faces": photo_faces}).model_dump()


# =============================================================================
# FAVORITES FULL (for /favorites page)
# =============================================================================

@router.get("/favorites-full")
async def get_favorites_full(
    user_id: str = Query(..., description="User ID"),
) -> dict:
    """
    Get all favorites with full image and gallery info.
    For /favorites page.
    """
    db = get_supabase_client().client

    # Get favorites
    favorites_result = db.table("favorites").select(
        "id, user_id, gallery_image_id, created_at"
    ).eq("user_id", user_id).order("created_at", desc=True).execute()

    favorites = favorites_result.data or []

    if not favorites:
        return ApiResponse.ok({"favorites": []}).model_dump()

    # Get image info
    image_ids = [f["gallery_image_id"] for f in favorites if f.get("gallery_image_id")]

    images_result = db.table("gallery_images").select(
        "id, slug, gallery_id, image_url, original_url, original_filename, file_size, width, height, created_at"
    ).in_("id", image_ids).execute()

    images_map = {img["id"]: img for img in (images_result.data or [])}

    # Get galleries info
    gallery_ids = list(set(img["gallery_id"] for img in (images_result.data or []) if img.get("gallery_id")))

    galleries_map = {}
    if gallery_ids:
        galleries_result = db.table("galleries").select(
            "id, slug"
        ).in_("id", gallery_ids).execute()
        galleries_map = {g["id"]: g for g in (galleries_result.data or [])}

    # Assemble response
    for fav in favorites:
        image = images_map.get(fav["gallery_image_id"], {})
        gallery = galleries_map.get(image.get("gallery_id"), {})

        fav["gallery_images"] = {
            **image,
            "galleries": gallery,
            "gallery_slug": gallery.get("slug") or image.get("gallery_id")
        } if image else None

    return ApiResponse.ok({"favorites": favorites}).model_dump()
