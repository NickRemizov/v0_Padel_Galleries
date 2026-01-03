"""
Admin Authentication Router - Google OAuth

Endpoints:
- GET /api/admin/auth/login - Redirect to Google OAuth
- GET /api/admin/auth/callback - Handle OAuth callback
- GET /api/admin/auth/me - Get current admin info
- POST /api/admin/auth/logout - Logout (clear cookie)
"""

from fastapi import APIRouter, HTTPException, Response, Request
from fastapi.responses import RedirectResponse
import httpx
import os
from datetime import datetime, timezone
from jose import jwt
from typing import Optional

from core.logging import get_logger
from services.supabase.base import get_supabase_client

logger = get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["Admin Auth"])

# Config
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET_KEY", "change_this_secret_key")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://vlcpadel.com")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 7


def create_admin_token(admin: dict) -> str:
    """Create JWT token for admin session."""
    from datetime import timedelta

    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": admin["id"],
        "email": admin["email"],
        "name": admin.get("name"),
        "role": admin["role"],
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def verify_admin_token(token: str) -> Optional[dict]:
    """Verify JWT token and return admin data."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except Exception as e:
        logger.warning(f"Token verification failed: {e}")
        return None


@router.get("/login")
async def login_redirect(request: Request):
    """Redirect to Google OAuth consent screen."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "Google OAuth not configured")

    # Callback URL
    callback_url = f"{request.base_url}api/admin/auth/callback"

    # Google OAuth URL
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={callback_url}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
        "&prompt=consent"
    )

    return RedirectResponse(url=google_auth_url)


@router.get("/callback")
async def oauth_callback(code: str, request: Request, response: Response):
    """Handle Google OAuth callback."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth not configured")

    callback_url = f"{request.base_url}api/admin/auth/callback"

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": callback_url,
                "grant_type": "authorization_code",
            }
        )

        if token_response.status_code != 200:
            logger.error(f"Token exchange failed: {token_response.text}")
            return RedirectResponse(f"{FRONTEND_URL}/admin/login?error=oauth_failed")

        tokens = token_response.json()

        # Get user info
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )

        if userinfo_response.status_code != 200:
            logger.error(f"Userinfo failed: {userinfo_response.text}")
            return RedirectResponse(f"{FRONTEND_URL}/admin/login?error=userinfo_failed")

        userinfo = userinfo_response.json()

    email = userinfo.get("email", "").lower()
    name = userinfo.get("name", "")
    avatar_url = userinfo.get("picture", "")

    logger.info(f"OAuth callback for: {email}")

    # Check if admin exists in DB
    supabase = get_supabase_client()
    result = supabase.table("admins").select("*").eq("email", email).execute()

    if not result.data:
        logger.warning(f"Non-admin tried to login: {email}")
        return RedirectResponse(f"{FRONTEND_URL}/admin/login?error=not_admin")

    admin = result.data[0]

    if not admin.get("is_active", True):
        logger.warning(f"Inactive admin tried to login: {email}")
        return RedirectResponse(f"{FRONTEND_URL}/admin/login?error=inactive")

    # Update last_login and avatar
    supabase.table("admins").update({
        "last_login_at": datetime.now(timezone.utc).isoformat(),
        "avatar_url": avatar_url,
        "name": name or admin.get("name"),
    }).eq("id", admin["id"]).execute()

    # Create JWT token
    token = create_admin_token(admin)

    # Redirect to frontend callback handler
    redirect_response = RedirectResponse(f"{FRONTEND_URL}/admin/callback?token={token}")

    # Also set as httpOnly cookie for security
    redirect_response.set_cookie(
        key="admin_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    logger.info(f"Admin logged in: {email} ({admin['role']})")
    return redirect_response


@router.get("/me")
async def get_current_admin(request: Request):
    """Get current admin info from token."""
    # Try cookie first, then Authorization header
    token = request.cookies.get("admin_token")

    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "")

    if not token:
        raise HTTPException(401, "Not authenticated")

    admin_data = verify_admin_token(token)
    if not admin_data:
        raise HTTPException(401, "Invalid or expired token")

    # Get fresh data from DB
    supabase = get_supabase_client()
    result = supabase.table("admins").select("*").eq("id", admin_data["sub"]).execute()

    if not result.data:
        raise HTTPException(401, "Admin not found")

    admin = result.data[0]

    return {
        "id": admin["id"],
        "email": admin["email"],
        "name": admin.get("name"),
        "avatar_url": admin.get("avatar_url"),
        "role": admin["role"],
        "is_active": admin.get("is_active", True),
    }


@router.post("/logout")
async def logout(response: Response):
    """Logout - clear cookie."""
    response.delete_cookie("admin_token")
    return {"success": True}
