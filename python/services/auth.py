"""
Authentication service for FastAPI.

Existing: Google OAuth + custom JWT tokens
Added (Phase 0): Supabase JWT verification for protected endpoints

v1.0: Original Google OAuth
v2.0: Added Supabase JWT verification (26.12.2025)
"""

from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional
import os
from dotenv import load_dotenv
import httpx

from core.logging import get_logger

load_dotenv()

logger = get_logger(__name__)

# === Security schemes ===
security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

# === Environment variables ===
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change_this_secret_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 часа

# Supabase JWT settings
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# Admin emails - users who can perform write operations
# TODO: Move to database or config file
ADMIN_EMAILS = [
    "nick.remizov@gmail.com",
    # Add more admin emails here
]


# ============================================================
# EXISTING FUNCTIONS (Google OAuth + Custom JWT) - DO NOT MODIFY
# ============================================================

async def verify_google_token(token: str) -> dict:
    """Проверка Google OAuth токена"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Неверный Google токен")
            
            token_info = response.json()
            
            # Проверяем что токен для нашего приложения
            if token_info.get("aud") != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=401, detail="Токен не для этого приложения")
            
            return token_info
    
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Ошибка проверки токена: {str(e)}")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Создание JWT токена"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Получение текущего пользователя из JWT токена"""
    token = credentials.credentials
    
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        user_email: str = payload.get("sub")
        
        if user_email is None:
            raise HTTPException(status_code=401, detail="Неверный токен")
        
        return {"email": user_email, "name": payload.get("name")}
    
    except JWTError:
        raise HTTPException(status_code=401, detail="Неверный токен")


# Опциональная аутентификация (для публичных endpoint'ов)
async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[dict]:
    """Опциональная аутентификация - не требует токен"""
    if credentials is None:
        return None
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        user_email: str = payload.get("sub")
        
        if user_email is None:
            return None
        
        return {"email": user_email, "name": payload.get("name"), "sub": user_email}
    except:
        return None


# ============================================================
# NEW FUNCTIONS (Supabase JWT) - Phase 0
# ============================================================

async def verify_supabase_token(token: str) -> dict:
    """
    Verify Supabase JWT token and return user data.
    
    Args:
        token: JWT token from Supabase Auth
        
    Returns:
        dict with user info: {id, email, role, ...}
        
    Raises:
        HTTPException 401 if token is invalid
        HTTPException 500 if SUPABASE_JWT_SECRET not configured
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
        logger.warning(f"Supabase JWT verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_supabase_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional)
) -> Optional[dict]:
    """
    Get current user from Supabase JWT if token provided, None otherwise.
    For endpoints that work for both authenticated and anonymous users.
    
    Usage:
        @router.get("/something")
        async def something(user: Optional[dict] = Depends(get_supabase_user_optional)):
            if user:
                print(f"Authenticated: {user['email']}")
            else:
                print("Anonymous user")
    """
    if credentials is None:
        return None
    
    try:
        return await verify_supabase_token(credentials.credentials)
    except HTTPException:
        return None


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    """
    Require valid Supabase authentication.
    Use this for endpoints that require any authenticated user.
    
    Usage:
        @router.post("/something")
        async def something(user: dict = Depends(require_auth)):
            print(f"User: {user['email']}")
            
    Raises:
        HTTPException 401 if not authenticated
    """
    return await verify_supabase_token(credentials.credentials)


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    """
    Require admin authentication.
    Use this for endpoints that require admin privileges.
    
    Usage:
        @router.delete("/something/{id}")
        async def delete_something(
            id: str,
            user: dict = Depends(require_admin)
        ):
            # Only admins can delete
            
    Raises:
        HTTPException 401 if not authenticated
        HTTPException 403 if not admin
    """
    user = await verify_supabase_token(credentials.credentials)
    
    email = user.get("email")
    if not email or email.lower() not in [e.lower() for e in ADMIN_EMAILS]:
        logger.warning(f"Non-admin access attempt: {email}")
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    
    logger.info(f"Admin access granted: {email}")
    return user
