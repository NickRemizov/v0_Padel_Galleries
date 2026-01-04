"""
Authentication Middleware for FastAPI

Protects all write operations (POST/PUT/PATCH/DELETE) with admin auth.
GET/HEAD/OPTIONS requests are PUBLIC by design — this is a public gallery site.

Security model:
- Public read: galleries, photos, players are public content
- Protected write: only authenticated admins can create/update/delete

v1.0: Initial implementation
v1.1: Fixed HTTPException handling from verify_supabase_token
v2.0: Switched to admins table + Google OAuth JWT
v2.1: Added fallback to Supabase JWT for legacy sessions
v2.2: Security hardening — require JWT_SECRET, proper exception handling
"""

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError
import os

from core.logging import get_logger

logger = get_logger(__name__)

# Google OAuth JWT secret (REQUIRED)
JWT_SECRET = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET_KEY environment variable is required")

# Supabase JWT secret (optional, for legacy sessions)
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ALGORITHM = "HS256"


def decode_token(token: str) -> dict | None:
    """
    Try to decode JWT token using available secrets.
    Returns payload dict or None if all attempts fail.
    """
    # 1. Try Google OAuth JWT (admin_token)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("role"):  # Google OAuth tokens have role
            return payload
    except ExpiredSignatureError:
        logger.debug("Google OAuth token expired")
        return None
    except JWTError:
        # Not a Google OAuth token, try Supabase
        pass

    # 2. Try Supabase JWT (legacy)
    if SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=[ALGORITHM])
            # Supabase tokens have 'sub' with user_id
            if payload.get("sub"):
                # Map Supabase payload to admin format
                return {
                    "sub": payload.get("sub"),
                    "email": payload.get("email", ""),
                    "role": "admin",  # Assume admin for Supabase users
                }
        except ExpiredSignatureError:
            logger.debug("Supabase token expired")
            return None
        except JWTError as e:
            logger.warning(f"Supabase JWT decode failed: {e}")
            return None

    return None


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces authentication for write operations.

    Rules:
    - OPTIONS: Always allowed (CORS preflight)
    - GET/HEAD: Always allowed (public read)
    - POST/PUT/PATCH/DELETE on /api/*: Requires admin token
    - Non-/api/ paths: Always allowed (static files, docs, etc.)
    - Auth endpoints: Always allowed (login/callback/logout)
    """

    # Paths that are always public (even for write methods)
    PUBLIC_PATHS = {
        "/",
        "/api/health",
        "/api/docs",
        "/api/redoc",
        "/api/openapi.json",
    }

    # Auth paths - public for OAuth flow
    AUTH_PATHS_PREFIX = "/api/admin/auth"

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/") or "/"  # Normalize trailing slash
        method = request.method

        # 1. OPTIONS — always allow (CORS preflight)
        if method == "OPTIONS":
            return await call_next(request)

        # 2. Public paths — always allow
        if path in self.PUBLIC_PATHS:
            return await call_next(request)

        # 3. Auth paths — always allow (OAuth flow)
        if path.startswith(self.AUTH_PATHS_PREFIX):
            return await call_next(request)

        # 4. Non-API paths (uploads, static) — always allow
        if not path.startswith("/api"):
            return await call_next(request)

        # 5. Try to get token (for both read and write operations)
        token = request.cookies.get("admin_token")
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.replace("Bearer ", "")

        # 6. If token exists, validate and set request.state.admin
        if token:
            payload = decode_token(token)
            if payload:
                admin_email = payload.get("email", "")
                admin_role = payload.get("role", "")

                if admin_role:
                    request.state.admin = {
                        "id": payload.get("sub"),
                        "email": admin_email,
                        "name": payload.get("name"),
                        "role": admin_role,
                    }
                    logger.debug(f"Auth middleware: Admin {admin_email} ({admin_role}) for {method} {path}")
            else:
                # Invalid token - for GET we continue without admin, for write we reject
                if method not in ["GET", "HEAD"]:
                    logger.warning(f"Auth middleware: Token verification failed for {method} {path}")
                    return JSONResponse(
                        {"detail": "Invalid or expired token"},
                        status_code=401
                    )

        # 7. GET/HEAD — allow even without token (public read, but admin may be set)
        if method in ["GET", "HEAD"]:
            return await call_next(request)

        # 8. Write operations require authenticated admin
        if not hasattr(request.state, "admin") or not request.state.admin:
            logger.warning(f"Auth middleware: No token for {method} {path}")
            return JSONResponse(
                {"detail": "Not authenticated"},
                status_code=401
            )

        return await call_next(request)
