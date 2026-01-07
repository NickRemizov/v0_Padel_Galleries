"""
Site Content Management Router

CRUD operations for site_content table.
Used for welcome message and other editable content.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from core.logging import get_logger
from services.supabase.base import get_supabase_client

logger = get_logger(__name__)

router = APIRouter(prefix="/content", tags=["Content Management"])


class WelcomeContentUpdate(BaseModel):
    title: str
    content: str
    version: int


@router.get("/welcome")
async def get_welcome_content(request: Request):
    """Get current welcome message content for editing."""
    supabase = get_supabase_client()

    result = supabase.table("site_content")\
        .select("*")\
        .eq("key", "welcome")\
        .single()\
        .execute()

    if not result.data:
        # Return default if not exists
        return {
            "key": "welcome",
            "value": {
                "version": 1,
                "title": "Welcome!",
                "content": ""
            },
            "updated_at": None
        }

    return result.data


@router.put("/welcome")
async def update_welcome_content(data: WelcomeContentUpdate, request: Request):
    """Update welcome message content."""
    supabase = get_supabase_client()

    value = {
        "version": data.version,
        "title": data.title,
        "content": data.content,
    }

    # Upsert into site_content
    result = supabase.table("site_content").upsert({
        "key": "welcome",
        "value": value,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    if not result.data:
        raise HTTPException(500, "Failed to update content")

    logger.info(f"Welcome content updated to v{data.version}")

    return {"success": True, "data": result.data[0]}


@router.post("/welcome/reset-seen")
async def reset_welcome_seen(request: Request):
    """Reset welcome_version_seen for all users to 0.
    This will make the welcome message appear again for everyone.
    """
    supabase = get_supabase_client()

    # Update all users
    result = supabase.table("users")\
        .update({"welcome_version_seen": 0})\
        .neq("id", "00000000-0000-0000-0000-000000000000")\
        .execute()

    count = len(result.data) if result.data else 0
    logger.info(f"Reset welcome_version_seen for {count} users")

    return {"success": True, "reset_count": count}
