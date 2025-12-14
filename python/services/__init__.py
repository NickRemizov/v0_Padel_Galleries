"""
Services package.

Main modules:
- face_recognition.py - FaceRecognitionService facade
- training_service.py - TrainingService facade
- supabase_client.py - Supabase client wrapper
- supabase_database.py - Database operations

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
"""

from services.face_recognition import FaceRecognitionService
from services.training_service import TrainingService
from services.supabase_client import SupabaseClient
from services.supabase_database import SupabaseDatabase

__all__ = [
    'FaceRecognitionService',
    'TrainingService',
    'SupabaseClient', 
    'SupabaseDatabase',
]
