"""
Admin Router Package - Administrative endpoints for face recognition system

Migrated from frontend direct Supabase access to centralized FastAPI.

v1.0: Initial modular structure (refactored from monolithic admin.py)
"""

from fastapi import APIRouter

from services.supabase_database import SupabaseDatabase
from core.logging import get_logger

logger = get_logger(__name__)

# Global service instances (set via set_services)
supabase_db_instance: SupabaseDatabase = None


def set_services(supabase_db: SupabaseDatabase):
    """Set service instances for dependency injection."""
    global supabase_db_instance
    supabase_db_instance = supabase_db
    logger.info("Admin router services initialized")


# Create main router
router = APIRouter()

# Import sub-routers AFTER globals are defined
from .statistics import router as statistics_router
from .debug import router as debug_router
from .check import router as check_router

# Include all sub-routers
router.include_router(statistics_router)
router.include_router(debug_router)
router.include_router(check_router)

# Export for main.py
__all__ = ["router", "set_services"]
