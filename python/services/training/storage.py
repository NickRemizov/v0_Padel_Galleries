"""
Training Storage - HNSW index save/load.

v5.0: This module is deprecated. Index is now loaded from database
on startup and doesn't need file-based persistence.
"""

import logging

logger = logging.getLogger(__name__)


async def save_index(face_service, models_dir: str = None):
    """
    Save HNSW index to disk (deprecated).

    Index is now rebuilt from database on startup, no file persistence needed.
    """
    logger.warning("[TrainingStorage] save_index is deprecated - index is loaded from database")


def load_index(face_service, models_dir: str = None) -> bool:
    """
    Load HNSW index from disk (deprecated).

    Index is now loaded from database via _load_players_index().
    """
    logger.warning("[TrainingStorage] load_index is deprecated - index is loaded from database")
    return False
