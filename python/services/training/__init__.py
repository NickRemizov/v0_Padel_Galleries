"""
Training Package - Face recognition model training operations.

Modules:
- dataset.py - Dataset preparation and photo utilities
- metrics.py - Training metrics calculation
- session.py - Session management (create, status, history)
- pipeline.py - Background training process
- storage.py - HNSW index save/load
- batch.py - Batch recognition operations

v2.0: Modular structure (refactored from monolithic training_service.py)
"""

from .dataset import prepare_dataset, download_photo, match_face_to_detected
from .metrics import calculate_metrics, calculate_distribution
from .session import create_session, get_status, get_history, update_session_completed, update_session_failed
from .pipeline import run_training_pipeline
from .storage import save_index, load_index
from .batch import batch_recognize

__all__ = [
    # Dataset
    "prepare_dataset",
    "download_photo", 
    "match_face_to_detected",
    
    # Metrics
    "calculate_metrics",
    "calculate_distribution",
    
    # Session
    "create_session",
    "get_status",
    "get_history",
    "update_session_completed",
    "update_session_failed",
    
    # Pipeline
    "run_training_pipeline",
    
    # Storage
    "save_index",
    "load_index",
    
    # Batch
    "batch_recognize",
]
