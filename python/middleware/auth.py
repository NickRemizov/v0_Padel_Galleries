"""
Authentication Middleware for FastAPI
Protects all write operations (POST/PUT/PATCH/DELETE) with admin auth.
GET/HEAD/OPTIONS requests are public.

v1.0: Initial implementation
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from core.logging import get_logger
from services.auth import verify_supabase_token, ADMIN_EMAILS

logger = get_logger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces authentication for write operations.
    
    Rules:
    - OPTIONS: Always allowed (CORS preflight)
    - GET/HEAD: Always allowed (public read)
    - POST/PUT/PATCH/DELETE on /api/*: Requires admin token
    - Non-/api/ paths: Always allowed (static files, docs, etc.)
    """
    
    # Paths that are always public (even for write methods)
    PUBLIC_PATHS = {
        "/",
        "/api/health",
        "/api/docs",
        "/api/redoc",
        "/api/openapi.json",
    }
    
    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/") or "/"  # Normalize trailing slash
        method = request.method
        
        # 1. OPTIONS — always allow (CORS preflight)
        if method == "OPTIONS":
            return await call_next(request)
        
        # 2. Public paths — always allow
        if path in self.PUBLIC_PATHS:
            return await call_next(request)
        
        # 3. Non-API paths (uploads, static) — always allow
        if not path.startswith("/api"):
            return await call_next(request)
        
        # 4. GET/HEAD on /api/* — public read
        if method in ["GET", "HEAD"]:
            return await call_next(request)
        
        # 5. Write operations (POST/PUT/PATCH/DELETE) — require admin token
        auth_header = request.headers.get("Authorization", "")
        
        if not auth_header.startswith("Bearer "):
            logger.warning(f"Auth middleware: No token for {method} {path}")
            return JSONResponse(
                {"detail": "Not authenticated"},
                status_code=401
            )
        
        token = auth_header.replace("Bearer ", "")
        
        try:
            user = await verify_supabase_token(token)
        except Exception as e:
            logger.error(f"Auth middleware: Token verification failed: {e}")
            return JSONResponse(
                {"detail": "Invalid token"},
                status_code=401
            )
        
        if not user:
            logger.warning(f"Auth middleware: Invalid token for {method} {path}")
            return JSONResponse(
                {"detail": "Invalid token"},
                status_code=401
            )
        
        user_email = user.get("email", "")
        
        if user_email not in ADMIN_EMAILS:
            logger.warning(f"Auth middleware: Non-admin {user_email} tried {method} {path}")
            return JSONResponse(
                {"detail": "Admin required"},
                status_code=403
            )
        
        # 6. Admin verified — add user to request state and proceed
        request.state.user = user
        logger.debug(f"Auth middleware: Admin {user_email} authorized for {method} {path}")
        
        return await call_next(request)
