"""
Admin Activity Router
Fetches activity feed for admin dashboard - user registrations, linking, settings changes.

Activity types:
- user_registered: New user registered via Telegram
- user_linked: Existing person linked to Telegram account
- name_changed: User changed their real_name
- privacy_changed: User changed privacy settings
"""

from fastapi import APIRouter, Query
from typing import Optional, List

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger
from services.supabase.base import get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


# Human-readable labels for event types
EVENT_TYPE_LABELS = {
    # User & Admin events
    "user_registered": "Регистрация",
    "user_linked": "Привязка TG",
    "google_linked": "Привязка Gmail",
    "person_created": "Создание",
    "person_deleted": "Удаление",
    "admin_created": "Назначение админа",
    "admin_deleted": "Удаление админа",
    "admin_activated": "Активация админа",
    "admin_deactivated": "Деактивация админа",
    # Settings events
    "name_changed": "Изменение имени",
    "privacy_changed": "Приватность",
    # Photo events
    "photo_verified": "Верификация",
    "photo_rejected": "Отклонение",
    "photo_hidden": "Скрытие",
    "photo_unhidden": "Показ",
}


@router.get("/activity")
async def get_admin_activity(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    event_types: Optional[str] = Query(None, description="Comma-separated event types to filter"),
):
    """
    Get admin activity feed.

    Returns all user events sorted by date, most recent first.
    Optional filtering by event types.
    """

    supabase = get_supabase_client()

    try:
        # Build query
        query = supabase.table("admin_activity")\
            .select(
                "id, event_type, user_id, person_id, metadata, created_at, "
                "people(id, real_name, telegram_full_name, telegram_username, avatar_url)"
            )\
            .order("created_at", desc=True)

        # Filter by event types if provided
        if event_types:
            types_list = [t.strip() for t in event_types.split(",") if t.strip()]
            if types_list:
                query = query.in_("event_type", types_list)

        # Pagination
        query = query.range(offset, offset + limit - 1)

        result = query.execute()
        activities = result.data or []

        # Collect person_ids to fetch current telegram avatars
        person_ids = [a.get("person_id") for a in activities if a.get("person_id")]

        # Fetch users by person_id to get current telegram photo_url
        person_to_avatar = {}
        if person_ids:
            users_result = supabase.table("users")\
                .select("person_id, photo_url")\
                .in_("person_id", person_ids)\
                .execute()
            for u in (users_result.data or []):
                if u.get("photo_url"):
                    person_to_avatar[u["person_id"]] = u["photo_url"]

        # Format response
        formatted_activities = []
        for activity in activities:
            person = activity.get("people") or {}
            metadata = activity.get("metadata") or {}

            # Get person name
            person_name = (
                person.get("real_name") or
                person.get("telegram_full_name") or
                metadata.get("telegram_full_name") or
                metadata.get("person_name") or
                "Неизвестный"
            )

            # Get avatar: prefer current telegram photo (via person_id), fallback to person's custom avatar
            person_id = activity.get("person_id")
            avatar_url = person_to_avatar.get(person_id) or person.get("avatar_url")

            formatted_activities.append({
                "id": activity["id"],
                "event_type": activity["event_type"],
                "event_label": EVENT_TYPE_LABELS.get(activity["event_type"], activity["event_type"]),
                "created_at": activity["created_at"],
                "person_id": activity.get("person_id"),
                "user_id": activity.get("user_id"),
                "person_name": person_name,
                "telegram_username": person.get("telegram_username") or metadata.get("telegram_username"),
                "user_avatar": avatar_url,
                "metadata": metadata,
            })

        # Get total count
        count_query = supabase.table("admin_activity").select("id", count="exact", head=True)
        if event_types:
            types_list = [t.strip() for t in event_types.split(",") if t.strip()]
            if types_list:
                count_query = count_query.in_("event_type", types_list)
        count_result = count_query.execute()
        total = count_result.count or 0

        return ApiResponse.ok({
            "activities": formatted_activities,
            "total": total,
            "limit": limit,
            "offset": offset,
        })

    except Exception as e:
        logger.error(f"Error fetching admin activity: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="get_admin_activity")
