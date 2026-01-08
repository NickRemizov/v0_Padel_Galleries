"""
Welcome Message API

Endpoints for getting welcome message and marking it as seen.
Shows welcome message when user's welcome_version_seen < current version.
"""

from fastapi import APIRouter, Request, HTTPException

from core.responses import ApiResponse
from core.logging import get_logger
from services.supabase.base import get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


@router.get("/welcome")
async def get_welcome(request: Request):
    """
    Get welcome message if user hasn't seen current version.

    Returns:
    - show: bool - whether to show the welcome message
    - title: str - welcome title (if show=True)
    - content: str - welcome content in markdown (if show=True)
    - version: int - current welcome version
    """
    supabase = get_supabase_client()

    # Get user_id from X-User-Id header (set by Next.js route)
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return ApiResponse.ok({
            "show": False,
            "reason": "not_authenticated"
        })

    try:
        # Get welcome content from site_content
        content_result = supabase.table("site_content")\
            .select("value")\
            .eq("key", "welcome")\
            .single()\
            .execute()

        if not content_result.data:
            return ApiResponse.ok({
                "show": False,
                "reason": "no_welcome_content"
            })

        welcome_data = content_result.data.get("value", {})
        current_version = welcome_data.get("version", 1)

        # Get user's welcome_version_seen
        user_result = supabase.table("users")\
            .select("welcome_version_seen")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not user_result.data:
            return ApiResponse.ok({
                "show": False,
                "reason": "user_not_found"
            })

        user_version = user_result.data.get("welcome_version_seen", 0) or 0

        # Check if user needs to see welcome
        if user_version >= current_version:
            return ApiResponse.ok({
                "show": False,
                "reason": "already_seen",
                "version": current_version
            })

        # User needs to see welcome
        return ApiResponse.ok({
            "show": True,
            "title": welcome_data.get("title", "Добро пожаловать!"),
            "content": welcome_data.get("content", ""),
            "version": current_version
        })

    except Exception as e:
        logger.error(f"Error getting welcome: {e}")
        return ApiResponse.ok({
            "show": False,
            "reason": "error"
        })


@router.post("/welcome/seen")
async def mark_welcome_seen(request: Request):
    """
    Mark welcome message as seen for current user.
    Updates user's welcome_version_seen to current version.
    """
    supabase = get_supabase_client()

    # Get user_id from X-User-Id header (set by Next.js route)
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    try:
        # Get current welcome version
        content_result = supabase.table("site_content")\
            .select("value")\
            .eq("key", "welcome")\
            .single()\
            .execute()

        current_version = 1
        if content_result.data:
            current_version = content_result.data.get("value", {}).get("version", 1)

        # Update user's welcome_version_seen
        supabase.table("users")\
            .update({"welcome_version_seen": current_version})\
            .eq("id", user_id)\
            .execute()

        logger.info(f"User {user_id} marked welcome v{current_version} as seen")

        return ApiResponse.ok({
            "success": True,
            "version": current_version
        })

    except Exception as e:
        logger.error(f"Error marking welcome as seen: {e}")
        raise HTTPException(500, f"Error: {e}")
