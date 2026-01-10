"""
Training Package - Face recognition indexing operations.

Modules:
- dataset.py - Dataset preparation and photo utilities
- metrics.py - Training metrics calculation
- session.py - Session management (create, status, history)
- batch.py - Batch recognition operations

Note: pipeline.py and storage.py were removed (deprecated dead code).
"""

from .dataset import prepare_dataset, download_photo, match_face_to_detected
from .metrics import calculate_metrics, calculate_distribution
from .session import create_session, get_status, get_history, update_session_completed, update_session_failed
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

    # Batch
    "batch_recognize",
]
