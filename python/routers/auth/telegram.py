"""
Telegram Authentication Router

Logic:
1. Search by telegram_id (unique, never changes)
   - Found → update telegram_username and telegram_full_name
   - Not found → step 2

2. Search by telegram_username (case-insensitive, with @)
   - Found → link: set telegram_id, update telegram_full_name
   - Not found → step 3

3. Create new person with all Telegram data

4. Create or update user record
5. Return user data
"""

import hashlib
import hmac
import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.config import settings
from core.logging import get_logger
from infrastructure.supabase import get_supabase_client

logger = get_logger(__name__)
router = APIRouter()


# =============================================================================
# Schemas
# =============================================================================

class TelegramAuthRequest(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


class UserResponse(BaseModel):
    id: str
    telegram_id: int
    username: Optional[str]
    first_name: str
    last_name: Optional[str]
    photo_url: Optional[str]
    person_id: str


# =============================================================================
# Telegram Auth Verification
# =============================================================================

def verify_telegram_auth(data: dict, bot_token: str) -> bool:
    """Verify Telegram authentication data."""
    check_hash = data.pop("hash", None)
    if not check_hash:
        return False

    # Create data-check-string
    check_string = "\n".join(
        f"{key}={data[key]}"
        for key in sorted(data.keys())
        if data[key] is not None
    )

    # Create secret key from bot token
    secret_key = hashlib.sha256(bot_token.encode()).digest()

    # Create HMAC hash
    computed_hash = hmac.new(
        secret_key,
        check_string.encode(),
        hashlib.sha256
    ).hexdigest()

    return computed_hash == check_hash


def is_auth_data_valid(auth_date: int) -> bool:
    """Check if auth data is not expired (24 hours)."""
    current_time = int(time.time())
    return (current_time - auth_date) < 86400


# =============================================================================
# Database Operations
# =============================================================================

def find_person_by_telegram_id(db, telegram_id: int) -> Optional[dict]:
    """Find person by telegram_id."""
    result = db.table("people").select("id").eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None


def find_person_by_username(db, username: str) -> Optional[dict]:
    """Find person by telegram_username (case-insensitive)."""
    username_with_at = f"@{username}"
    result = db.table("people").select(
        "id, real_name, telegram_full_name"
    ).ilike("telegram_username", username_with_at).execute()
    return result.data[0] if result.data else None


def update_person_by_id(
    db,
    person_id: str,
    first_name: str,
    last_name: Optional[str],
    username: Optional[str]
) -> None:
    """Update person found by telegram_id."""
    full_name = f"{first_name} {last_name}" if last_name else first_name
    telegram_username = f"@{username}" if username else None

    db.table("people").update({
        "telegram_username": telegram_username,
        "telegram_full_name": full_name,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", person_id).execute()


def link_person_by_username(
    db,
    person_id: str,
    telegram_id: int,
    first_name: str,
    last_name: Optional[str]
) -> None:
    """Link person found by username to Telegram account."""
    full_name = f"{first_name} {last_name}" if last_name else first_name

    db.table("people").update({
        "telegram_id": telegram_id,
        "telegram_full_name": full_name,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", person_id).execute()


def create_new_person(
    db,
    telegram_id: int,
    first_name: str,
    last_name: Optional[str],
    username: Optional[str]
) -> str:
    """Create new person for first-time Telegram user."""
    full_name = f"{first_name} {last_name}" if last_name else first_name
    telegram_username = f"@{username}" if username else None

    result = db.table("people").insert({
        "telegram_id": telegram_id,
        "telegram_username": telegram_username,
        "telegram_full_name": full_name,
        "real_name": full_name,
        "created_by": "auto_login",
        "show_in_players_gallery": False,
    }).execute()

    person_id = result.data[0]["id"]
    logger.info(f"Created new person {person_id} for Telegram user {telegram_id}")
    return person_id


def get_or_create_user(
    db,
    telegram_id: int,
    username: Optional[str],
    first_name: str,
    last_name: Optional[str],
    photo_url: Optional[str],
    person_id: str
) -> dict:
    """Get or create user record."""
    # Check existing user
    result = db.table("users").select("*").eq("telegram_id", telegram_id).execute()

    if result.data:
        # Update existing user
        update_result = db.table("users").update({
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
            "photo_url": photo_url,
            "person_id": person_id,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("telegram_id", telegram_id).select().execute()
        return update_result.data[0]
    else:
        # Create new user
        insert_result = db.table("users").insert({
            "telegram_id": telegram_id,
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
            "photo_url": photo_url,
            "person_id": person_id,
        }).select().execute()
        return insert_result.data[0]


def log_admin_activity(db, event_type: str, person_id: str, metadata: dict) -> None:
    """Log activity to admin_activity table (fire-and-forget)."""
    try:
        db.table("admin_activity").insert({
            "event_type": event_type,
            "person_id": person_id,
            "metadata": metadata,
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to log admin activity: {e}")


# =============================================================================
# Endpoint
# =============================================================================

@router.post("/telegram")
async def telegram_auth(data: TelegramAuthRequest) -> dict:
    """
    Authenticate user via Telegram Login Widget.

    Returns user data to be stored in cookie by frontend.
    """
    # Check bot token
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=500, detail="Telegram bot token not configured")

    # Prepare auth data for verification
    auth_data = {
        "id": str(data.id),
        "first_name": data.first_name,
        "auth_date": str(data.auth_date),
        "hash": data.hash,
    }
    if data.last_name:
        auth_data["last_name"] = data.last_name
    if data.username:
        auth_data["username"] = data.username
    if data.photo_url:
        auth_data["photo_url"] = data.photo_url

    # Verify auth
    if not verify_telegram_auth(auth_data.copy(), settings.telegram_bot_token):
        raise HTTPException(status_code=401, detail="Invalid authentication data")

    # Check expiration
    if not is_auth_data_valid(data.auth_date):
        raise HTTPException(status_code=401, detail="Authentication data expired")

    # Get database client
    db = get_supabase_client().client

    # === FIND OR CREATE PERSON ===
    person_id: str

    # Step 1: Search by telegram_id
    person_by_id = find_person_by_telegram_id(db, data.id)

    if person_by_id:
        person_id = person_by_id["id"]
        update_person_by_id(db, person_id, data.first_name, data.last_name, data.username)
        logger.info(f"Found person {person_id} by telegram_id {data.id}")

    elif data.username:
        # Step 2: Search by telegram_username
        person_by_username = find_person_by_username(db, data.username)

        if person_by_username:
            person_id = person_by_username["id"]
            old_telegram_full_name = person_by_username.get("telegram_full_name")
            person_name = person_by_username.get("real_name") or old_telegram_full_name

            link_person_by_username(db, person_id, data.id, data.first_name, data.last_name)
            logger.info(f"Linked person {person_id} by username @{data.username}")

            # Log admin activity: user linked
            new_telegram_full_name = f"{data.first_name} {data.last_name}" if data.last_name else data.first_name
            name_changed = old_telegram_full_name and old_telegram_full_name != new_telegram_full_name

            log_admin_activity(db, "user_linked", person_id, {
                "telegram_username": f"@{data.username}",
                "person_name": person_name,
                "telegram_full_name": new_telegram_full_name,
                "old_telegram_full_name": old_telegram_full_name if name_changed else None,
                "linked_by": "username",
            })
        else:
            # Step 3: Create new person
            person_id = create_new_person(db, data.id, data.first_name, data.last_name, data.username)

            # Log admin activity: user registered
            full_name = f"{data.first_name} {data.last_name}" if data.last_name else data.first_name
            log_admin_activity(db, "user_registered", person_id, {
                "telegram_username": f"@{data.username}" if data.username else None,
                "telegram_full_name": full_name,
                "person_name": full_name,
            })
    else:
        # No username provided, create new person
        person_id = create_new_person(db, data.id, data.first_name, data.last_name, data.username)

        # Log admin activity: user registered
        full_name = f"{data.first_name} {data.last_name}" if data.last_name else data.first_name
        log_admin_activity(db, "user_registered", person_id, {
            "telegram_username": None,
            "telegram_full_name": full_name,
            "person_name": full_name,
        })

    # === CREATE OR UPDATE USER ===
    user = get_or_create_user(
        db,
        telegram_id=data.id,
        username=data.username,
        first_name=data.first_name,
        last_name=data.last_name,
        photo_url=data.photo_url,
        person_id=person_id,
    )

    return {"user": user}
