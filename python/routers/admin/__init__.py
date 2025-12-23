"""
Admin API Router Package
Administrative endpoints for face recognition system

v5.0: Refactored into modular structure (helpers, statistics, debug, check)
"""

from fastapi import APIRouter

from core.logging import get_logger
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)

# Global service instance (set via set_services)
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
