"""
Training Package - Face recognition indexing operations.

Modules:
- dataset.py - Dataset preparation and photo utilities
- metrics.py - Training metrics calculation
- batch.py - Batch recognition operations

Note: pipeline.py, storage.py, session.py were removed (deprecated dead code).
"""

from .dataset import prepare_dataset, download_photo, match_face_to_detected
from .metrics import calculate_metrics, calculate_distribution
from .batch import batch_recognize

__all__ = [
    # Dataset
    "prepare_dataset",
    "download_photo",
    "match_face_to_detected",

    # Metrics
    "calculate_metrics",
    "calculate_distribution",

    # Batch
    "batch_recognize",
]
