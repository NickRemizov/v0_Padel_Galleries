"""
User Activity Router
Fetches combined activity feed for the authenticated user.

Activity types:
- new_photos: New photos with this person in a gallery (grouped by gallery)
- comment_received: Someone commented on a photo with this person
- photo_hidden/unhidden: User hid/showed their photo
- photo_verified/rejected: User verified/rejected recognition
- favorite_added: User added photo to favorites
"""

from fastapi import APIRouter, Query
from datetime import datetime, timezone
from typing import Optional

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger
from services.supabase.base import get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


@router.get("/activity")
async def get_user_activity(
    person_id: str = Query(..., description="Person UUID from telegram_user cookie"),
    user_id: Optional[str] = Query(None, description="User ID for favorites"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """
    Get combined activity feed for authenticated user.

    Security: person_id is verified by Next.js API from telegram_user cookie.

    Combines data from multiple sources:
    1. user_activity table (hide/unhide/verify/reject actions)
    2. photo_faces (new photos with user, grouped by gallery)
    3. comments on photos where user appears
    4. user's favorites

    Returns activities sorted by date, most recent first.
    """

    supabase = get_supabase_client()
    activities = []

    try:
        # 1. User actions from user_activity table
        user_actions = supabase.table("user_activity")\
            .select("id, activity_type, image_id, gallery_id, metadata, created_at")\
            .eq("person_id", person_id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()

        for action in (user_actions.data or []):
            activities.append({
                "type": action["activity_type"],
                "created_at": action["created_at"],
                "image_id": action.get("image_id"),
                "gallery_id": action.get("gallery_id"),
                "metadata": action.get("metadata") or {},
            })

        # 2. New photos with user (grouped by gallery and date)
        # Get recent photo_faces, group by gallery
        new_photos = supabase.table("photo_faces")\
            .select(
                "id, created_at, photo_id, "
                "gallery_images!inner(id, slug, gallery_id, galleries(id, slug, title))"
            )\
            .eq("person_id", person_id)\
            .order("created_at", desc=True)\
            .limit(200)\
            .execute()

        # Group by gallery_id and date (day)
        gallery_groups = {}
        for pf in (new_photos.data or []):
            gi = pf.get("gallery_images") or {}
            gallery = gi.get("galleries") or {}
            gallery_id = gi.get("gallery_id")
            created_date = pf["created_at"][:10]  # YYYY-MM-DD

            key = f"{gallery_id}_{created_date}"
            if key not in gallery_groups:
                gallery_groups[key] = {
                    "type": "new_photos",
                    "created_at": pf["created_at"],
                    "gallery_id": gallery_id,
                    "gallery_title": gallery.get("title"),
                    "gallery_slug": gallery.get("slug"),
                    "count": 0,
                    "image_ids": [],
                }
            gallery_groups[key]["count"] += 1
            gallery_groups[key]["image_ids"].append(gi.get("id"))

        for group in gallery_groups.values():
            activities.append({
                "type": "new_photos",
                "created_at": group["created_at"],
                "gallery_id": group["gallery_id"],
                "metadata": {
                    "gallery_title": group["gallery_title"],
                    "gallery_slug": group["gallery_slug"],
                    "count": group["count"],
                    "image_ids": group["image_ids"][:5],  # First 5 for preview
                },
            })

        # 3. Comments on photos where user appears
        # Use direct query (RPC function may not exist)
        comments_data = []
        try:
            # Fallback: get photo_ids for this person, then get comments
            person_photos = supabase.table("photo_faces")\
                .select("photo_id")\
                .eq("person_id", person_id)\
                .execute()

            photo_ids = [p["photo_id"] for p in (person_photos.data or [])]

            if photo_ids:
                comments = supabase.table("comments")\
                    .select(
                        "id, content, created_at, user_id, gallery_image_id, "
                        "users(first_name, username), "
                        "gallery_images(slug, galleries(title, slug))"
                    )\
                    .in_("gallery_image_id", photo_ids)\
                    .order("created_at", desc=True)\
                    .limit(limit)\
                    .execute()

                for comment in (comments.data or []):
                    # Skip own comments
                    if comment.get("user_id") == user_id:
                        continue

                    user_data = comment.get("users") or {}
                    gi = comment.get("gallery_images") or {}
                    gallery = gi.get("galleries") or {}

                    activities.append({
                        "type": "comment_received",
                        "created_at": comment["created_at"],
                        "image_id": comment["gallery_image_id"],
                        "metadata": {
                            "comment_preview": comment["content"][:100],
                            "commenter_name": user_data.get("first_name") or user_data.get("username"),
                            "image_slug": gi.get("slug"),
                            "gallery_title": gallery.get("title"),
                            "gallery_slug": gallery.get("slug"),
                        },
                    })
        except Exception as e:
            logger.warning(f"Error fetching comments for activity: {e}")

        # 4. User's favorites
        if user_id:
            favorites = supabase.table("favorites")\
                .select(
                    "id, created_at, gallery_image_id, "
                    "gallery_images(slug, original_filename, galleries(title, slug))"
                )\
                .eq("user_id", user_id)\
                .order("created_at", desc=True)\
                .limit(limit)\
                .execute()

            for fav in (favorites.data or []):
                gi = fav.get("gallery_images") or {}
                gallery = gi.get("galleries") or {}

                activities.append({
                    "type": "favorite_added",
                    "created_at": fav["created_at"],
                    "image_id": fav["gallery_image_id"],
                    "metadata": {
                        "image_slug": gi.get("slug"),
                        "filename": gi.get("original_filename"),
                        "gallery_title": gallery.get("title"),
                        "gallery_slug": gallery.get("slug"),
                    },
                })

        # Sort all activities by date, most recent first
        activities.sort(key=lambda x: x["created_at"], reverse=True)

        # Apply pagination
        activities = activities[offset:offset + limit]

        return ApiResponse.ok({
            "activities": activities,
            "total": len(activities),
            "limit": limit,
            "offset": offset,
        })

    except Exception as e:
        logger.error(f"Error fetching user activity: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="get_user_activity")
