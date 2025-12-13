"""
Dependency injection for recognition endpoints.
Shared instances and setup functions.
"""

from services.face_recognition import FaceRecognitionService
from services.supabase_client import SupabaseClient

# Global instances (set by main.py on startup)
face_service_instance: FaceRecognitionService = None
supabase_client_instance: SupabaseClient = None


def set_services(face_service: FaceRecognitionService, supabase_client: SupabaseClient):
    """
    Set the service instances. Called from main.py during startup.
    """
    global face_service_instance, supabase_client_instance
    face_service_instance = face_service
    supabase_client_instance = supabase_client


def get_face_service() -> FaceRecognitionService:
    """Dependency for FastAPI endpoints"""
    return face_service_instance


def get_supabase_client() -> SupabaseClient:
    """Dependency for FastAPI endpoints"""
    return supabase_client_instance
