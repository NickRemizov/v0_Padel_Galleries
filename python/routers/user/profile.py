"""
User Profile Router

Endpoints for user profile management (settings page).
"""

import re
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from core.logging import get_logger
from core.responses import ApiResponse
from infrastructure.supabase import get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


# =============================================================================
# Schemas
# =============================================================================

class ProfileUpdateRequest(BaseModel):
    """Request body for profile update."""
    real_name: Optional[str] = None
    gmail: Optional[str] = None
    facebook_profile_url: Optional[str] = None
    instagram_profile_url: Optional[str] = None
    paddle_ranking: Optional[float] = None
    show_in_players_gallery: Optional[bool] = None
    create_personal_gallery: Optional[bool] = None
    show_name_on_photos: Optional[bool] = None
    show_telegram_username: Optional[bool] = None
    show_social_links: Optional[bool] = None

    @field_validator("gmail")
    @classmethod
    def validate_gmail(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != "":
            if not re.match(r"^[a-zA-Z0-9._%+-]+@gmail\.com$", v):
                raise ValueError("Invalid Gmail format")
        return v

    @field_validator("paddle_ranking")
    @classmethod
    def validate_ranking(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            if v < 0 or v > 10:
                raise ValueError("Paddle ranking must be between 0 and 10")
            # Round to 0.25 step
            return round(v * 4) / 4
        return v


# Privacy settings for activity logging
PRIVACY_SETTINGS = [
    "show_in_players_gallery",
    "create_personal_gallery",
    "show_name_on_photos",
    "show_telegram_username",
    "show_social_links",
]

PRIVACY_SETTING_LABELS = {
    "show_in_players_gallery": "Показ в списке игроков",
    "create_personal_gallery": "Персональная галерея",
    "show_name_on_photos": "Имя на фото",
    "show_telegram_username": "Telegram username",
    "show_social_links": "Социальные ссылки",
}


# =============================================================================
# Helper Functions
# =============================================================================

def log_admin_activity(db, event_type: str, user_id: str, person_id: str, metadata: dict) -> None:
    """Log activity to admin_activity table (fire-and-forget)."""
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

@router.get("/profile/{person_id}")
async def get_profile(person_id: str) -> dict:
    """
    Get user profile by person_id.
    Returns person data for settings page.
    """
    db = get_supabase_client().client

    result = db.table("people").select("*").eq("id", person_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Person not found")

    return ApiResponse.ok(result.data[0]).model_dump()


@router.put("/profile/{person_id}")
async def update_profile(person_id: str, data: ProfileUpdateRequest, user_id: Optional[str] = None) -> dict:
    """
    Update user profile.

    Args:
        person_id: UUID of the person to update
        data: Fields to update
        user_id: Optional user ID for activity logging
    """
    db = get_supabase_client().client

    # Build update dict from non-None fields
    update_data = {}
    for field, value in data.model_dump().items():
        if value is not None:
            update_data[field] = value

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # Enforce cascading logic for privacy settings:
    # show_name_on_photos=false -> create_personal_gallery=false, show_in_players_gallery=false
    # create_personal_gallery=false -> show_in_players_gallery=false
    if update_data.get("show_name_on_photos") is False:
        update_data["create_personal_gallery"] = False
        update_data["show_in_players_gallery"] = False
    if update_data.get("create_personal_gallery") is False:
        update_data["show_in_players_gallery"] = False

    # Get current values before updating (for activity logging)
    current_result = db.table("people").select(
        "real_name, show_in_players_gallery, create_personal_gallery, "
        "show_name_on_photos, show_telegram_username, show_social_links"
    ).eq("id", person_id).execute()

    if not current_result.data:
        raise HTTPException(status_code=404, detail="Person not found")

    current_data = current_result.data[0]

    # Add updated_at timestamp
    update_data["updated_at"] = datetime.utcnow().isoformat()

    # Perform update
    db.table("people").update(update_data).eq("id", person_id).execute()

    # Fetch updated record
    updated_result = db.table("people").select("*").eq("id", person_id).execute()

    if not updated_result.data:
        raise HTTPException(status_code=500, detail="Failed to fetch updated profile")

    updated_person = updated_result.data[0]

    logger.info(f"User {user_id or 'unknown'} updated profile {person_id}: {list(update_data.keys())}")

    # Log admin activity for name change
    if user_id and "real_name" in update_data and current_data.get("real_name") != update_data["real_name"]:
        log_admin_activity(db, "name_changed", user_id, person_id, {
            "old_value": current_data.get("real_name"),
            "new_value": update_data["real_name"],
        })

    # Log admin activity for privacy settings changes
    if user_id:
        for setting in PRIVACY_SETTINGS:
            if setting in update_data and current_data.get(setting) != update_data[setting]:
                log_admin_activity(db, "privacy_changed", user_id, person_id, {
                    "setting_name": setting,
                    "setting_label": PRIVACY_SETTING_LABELS.get(setting, setting),
                    "old_value": current_data.get(setting),
                    "new_value": update_data[setting],
                })

    return ApiResponse.ok(updated_person).model_dump()
