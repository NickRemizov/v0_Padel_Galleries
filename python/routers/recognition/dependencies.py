"""
Dependency injection for recognition endpoints.
Shared instances and setup functions.

v1.1: Migrated to SupabaseService
"""

from services.face_recognition import FaceRecognitionService
from services.supabase import SupabaseService

# Global instances (set by main.py on startup)
face_service_instance: FaceRecognitionService = None
supabase_client_instance: SupabaseService = None


def set_services(face_service: FaceRecognitionService, supabase_client: SupabaseService):
    """
    Set the service instances. Called from main.py during startup.
    """
    global face_service_instance, supabase_client_instance
    face_service_instance = face_service
    supabase_client_instance = supabase_client


def get_face_service() -> FaceRecognitionService:
    """Dependency for FastAPI endpoints"""
    if face_service_instance is None:
        raise RuntimeError("FaceRecognitionService not initialized. Check server startup logs.")
    return face_service_instance


def get_supabase_client() -> SupabaseService:
    """Dependency for FastAPI endpoints"""
    if supabase_client_instance is None:
        raise RuntimeError("SupabaseService not initialized. Check server startup logs.")
    return supabase_client_instance
