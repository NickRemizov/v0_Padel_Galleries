"""
Authentication Middleware for FastAPI
Protects all write operations (POST/PUT/PATCH/DELETE) with admin auth.
GET/HEAD/OPTIONS requests are public.

v1.0: Initial implementation
v1.1: Fixed HTTPException handling from verify_supabase_token
v2.0: Switched to admins table + Google OAuth JWT
"""

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt
import os

from core.logging import get_logger

logger = get_logger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "change_this_secret_key")
ALGORITHM = "HS256"


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

        # 5. GET/HEAD on /api/* — public read
        if method in ["GET", "HEAD"]:
            return await call_next(request)

        # 6. Write operations (POST/PUT/PATCH/DELETE) — require admin token
        # Try cookie first, then Authorization header
        token = request.cookies.get("admin_token")

        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.replace("Bearer ", "")

        if not token:
            logger.warning(f"Auth middleware: No token for {method} {path}")
            return JSONResponse(
                {"detail": "Not authenticated"},
                status_code=401
            )

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        except Exception as e:
            logger.warning(f"Auth middleware: Token verification failed: {e}")
            return JSONResponse(
                {"detail": "Invalid or expired token"},
                status_code=401
            )

        admin_email = payload.get("email", "")
        admin_role = payload.get("role", "")

        if not admin_role:
            logger.warning(f"Auth middleware: No role in token for {admin_email}")
            return JSONResponse(
                {"detail": "Invalid token"},
                status_code=401
            )

        # 7. Admin verified — add to request state and proceed
        request.state.admin = {
            "id": payload.get("sub"),
            "email": admin_email,
            "name": payload.get("name"),
            "role": admin_role,
        }
        logger.debug(f"Auth middleware: Admin {admin_email} ({admin_role}) authorized for {method} {path}")

        return await call_next(request)
