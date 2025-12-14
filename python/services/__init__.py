"""
Services package.

Main modules:
- face_recognition.py - FaceRecognitionService facade
- insightface_model.py - InsightFace model management
- hnsw_index.py - HNSW index operations
- quality_filters.py - Face quality filtering
- grouping.py - Face clustering with HDBSCAN
- supabase_client.py - Supabase client wrapper
- supabase_database.py - Database operations
- training_service.py - Model training service
- auth.py - Authentication service
"""

from services.face_recognition import FaceRecognitionService
from services.supabase_client import SupabaseClient
from services.supabase_database import SupabaseDatabase

__all__ = [
    'FaceRecognitionService',
    'SupabaseClient', 
    'SupabaseDatabase',
]
