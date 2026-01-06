"""
Google Authentication Router

Logic:
1. Verify Google ID Token
2. Search by google_id in users
   - Found → update and return user
3. Search by email in people.gmail
   - Found → link: set google_id in user, return user
4. Create new person and user
5. Return user data
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.logging import get_logger
from core.responses import ApiResponse
from infrastructure.supabase import get_supabase_client
from services.auth import verify_google_token  # Reuse existing function

logger = get_logger(__name__)
router = APIRouter()


# =============================================================================
# Schemas
# =============================================================================

class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID Token


# =============================================================================
# Database Operations
# =============================================================================

def find_user_by_google_id(db, google_id: str) -> Optional[dict]:
    """Find user by google_id."""
    result = db.table("users").select("*").eq("google_id", google_id).execute()
    return result.data[0] if result.data else None


def find_person_by_gmail(db, email: str) -> Optional[dict]:
    """Find person by gmail (case-insensitive)."""
    result = db.table("people").select(
        "id, real_name, telegram_full_name"
    ).ilike("gmail", email).execute()
    return result.data[0] if result.data else None


def find_user_by_person_id(db, person_id: str) -> Optional[dict]:
    """Find user by person_id."""
    result = db.table("users").select("*").eq("person_id", person_id).execute()
    return result.data[0] if result.data else None


def update_user_with_google(db, user_id: str, google_id: str) -> dict:
    """Update existing user with Google ID."""
    db.table("users").update({
        "google_id": google_id,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", user_id).execute()

    result = db.table("users").select("*").eq("id", user_id).execute()
    return result.data[0]


def create_new_person_google(
    db,
    email: str,
    first_name: str,
    last_name: Optional[str]
) -> str:
    """Create new person for first-time Google user."""
    full_name = f"{first_name} {last_name}" if last_name else first_name

    result = db.table("people").insert({
        "gmail": email,
        "real_name": full_name,
        "created_by": "google_login",
        "show_in_players_gallery": False,
    }).execute()

    person_id = result.data[0]["id"]
    logger.info(f"Created new person {person_id} for Google user {email}")
    return person_id


def create_user_google(
    db,
    google_id: str,
    first_name: str,
    last_name: Optional[str],
    photo_url: Optional[str],
    person_id: str
) -> dict:
    """Create new user for Google login."""
    db.table("users").insert({
        "google_id": google_id,
        "first_name": first_name,
        "last_name": last_name,
        "photo_url": photo_url,
        "person_id": person_id,
    }).execute()

    result = db.table("users").select("*").eq("google_id", google_id).execute()
    return result.data[0]


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

@router.post("/google")
async def google_auth(data: GoogleAuthRequest) -> dict:
    """
    Authenticate user via Google Sign-In.

    Returns user data to be stored in cookie by frontend.
    """
    # Verify Google token (raises HTTPException on failure)
    token_info = await verify_google_token(data.credential)

    # Extract user info from token
    google_id = token_info.get("sub")
    email = token_info.get("email")
    first_name = token_info.get("given_name", token_info.get("name", "User"))
    last_name = token_info.get("family_name")
    photo_url = token_info.get("picture")

    if not google_id or not email:
        raise HTTPException(status_code=400, detail="Missing required fields from Google")

    # Get database client
    db = get_supabase_client().client

    # === FIND OR CREATE USER ===

    # Step 1: Search by google_id in users
    existing_user = find_user_by_google_id(db, google_id)

    if existing_user:
        # Update and return existing user
        user = update_user_with_google(db, existing_user["id"], google_id)
        logger.info(f"Found user {user['id']} by google_id")
        return ApiResponse.ok({"user": user}).model_dump()

    # Step 2: Search by email in people.gmail
    person_by_email = find_person_by_gmail(db, email)

    if person_by_email:
        person_id = person_by_email["id"]
        person_name = person_by_email.get("real_name") or person_by_email.get("telegram_full_name")

        # Check if this person already has a user
        existing_user_for_person = find_user_by_person_id(db, person_id)

        if existing_user_for_person:
            # Link Google to existing user (add google_id)
            user = update_user_with_google(db, existing_user_for_person["id"], google_id)
            logger.info(f"Linked Google to existing user {user['id']} via email {email}")

            # Log admin activity
            log_admin_activity(db, "google_linked", person_id, {
                "email": email,
                "person_name": person_name,
                "linked_by": "email",
            })
        else:
            # Create new user for existing person
            user = create_user_google(
                db, google_id, first_name, last_name, photo_url, person_id
            )
            logger.info(f"Created user for existing person {person_id} via email {email}")

            # Log admin activity
            log_admin_activity(db, "google_linked", person_id, {
                "email": email,
                "person_name": person_name,
                "linked_by": "email",
            })

        return ApiResponse.ok({"user": user}).model_dump()

    # Step 3: Create new person and user
    person_id = create_new_person_google(db, email, first_name, last_name)
    user = create_user_google(
        db, google_id, first_name, last_name, photo_url, person_id
    )

    # Log admin activity
    full_name = f"{first_name} {last_name}" if last_name else first_name
    log_admin_activity(db, "user_registered", person_id, {
        "email": email,
        "person_name": full_name,
        "auth_method": "google",
    })

    return ApiResponse.ok({"user": user}).model_dump()
