"""
Authentication service for FastAPI.
Verifies Supabase JWT tokens.

v2.0: Added Supabase JWT verification
"""

from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from typing import Optional
import os
from dotenv import load_dotenv

from core.logging import get_logger

load_dotenv()

logger = get_logger(__name__)

security = HTTPBearer(auto_error=False)

# Supabase JWT settings
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
ALGORITHM = "HS256"

# Public endpoints that don't require auth (patterns)
PUBLIC_PATHS = [
    "/api/docs",
    "/api/redoc", 
    "/api/openapi.json",
    "/api/health",
    "/",
]

# Methods that require authentication
PROTECTED_METHODS = ["POST", "PUT", "DELETE", "PATCH"]


def is_public_path(path: str) -> bool:
    """Check if path is public (no auth required)."""
    for public_path in PUBLIC_PATHS:
        if path.startswith(public_path):
            return True
    return False


async def verify_supabase_token(token: str) -> dict:
    """
    Verify Supabase JWT token and return user data.
    
    Returns:
        dict with user info: {sub, email, role, ...}
    
    Raises:
        HTTPException 401 if token is invalid
    """
    if not SUPABASE_JWT_SECRET:
        logger.error("SUPABASE_JWT_SECRET not configured!")
        raise HTTPException(
            status_code=500, 
            detail="Authentication not configured on server"
        )
    
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=[ALGORITHM],
            options={"verify_aud": False}  # Supabase doesn't always set aud
        )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
        
        return {
            "id": user_id,
            "email": payload.get("email"),
            "role": payload.get("role", "authenticated"),
            "aud": payload.get("aud"),
        }
        
    except JWTError as e:
        logger.warning(f"JWT verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """
    Get current user from Supabase JWT token.
    
    Usage in endpoint:
        @router.post("/something")
        async def something(user: dict = Depends(get_current_user)):
            print(user["email"])
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    return await verify_supabase_token(credentials.credentials)


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[dict]:
    """
    Get current user if token provided, None otherwise.
    For endpoints that work for both authenticated and anonymous users.
    """
    if credentials is None:
        return None
    
    try:
        return await verify_supabase_token(credentials.credentials)
    except HTTPException:
        return None


async def require_auth_for_write(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[dict]:
    """
    Require authentication for write operations (POST/PUT/DELETE/PATCH).
    GET requests pass through without auth.
    
    Usage: Add as dependency to router or individual endpoints.
    """
    # Allow GET, HEAD, OPTIONS without auth
    if request.method not in PROTECTED_METHODS:
        return None
    
    # Allow public paths
    if is_public_path(request.url.path):
        return None
    
    # Require auth for write operations
    if credentials is None:
        raise HTTPException(
            status_code=401, 
            detail="Authorization required for this operation"
        )
    
    return await verify_supabase_token(credentials.credentials)
