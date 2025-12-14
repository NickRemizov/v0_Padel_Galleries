"""
Training package for face recognition model training.

Modules:
- dataset.py - Dataset preparation and photo downloading
- metrics.py - Training metrics calculation

The main TrainingService facade remains in services/training_service.py
"""

from services.training.dataset import prepare_dataset, download_photo
from services.training.metrics import calculate_metrics, calculate_distribution

__all__ = [
    'prepare_dataset',
    'download_photo',
    'calculate_metrics',
    'calculate_distribution',
]
