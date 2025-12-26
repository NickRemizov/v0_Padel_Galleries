"""
Services package.

Main modules:
- face_recognition.py - FaceRecognitionService facade
- training_service.py - TrainingService facade
- supabase/ - Modular Supabase service (SupabaseService)

Supporting modules (extracted from main services):
- insightface_model.py - InsightFace model management
- hnsw_index.py - HNSW index operations
- quality_filters.py - Face quality filtering
- grouping.py - Face clustering with HDBSCAN

Training subpackage (services/training/):
- dataset.py - Dataset preparation
- metrics.py - Training metrics calculation

Other:
- auth.py - Authentication service

v4.1: Removed legacy supabase_client.py and supabase_database.py
      Use SupabaseService from services.supabase instead
"""

from services.face_recognition import FaceRecognitionService
from services.training_service import TrainingService
from services.supabase import SupabaseService, get_supabase_service

__all__ = [
    'FaceRecognitionService',
    'TrainingService',
    'SupabaseService',
    'get_supabase_service',
]
