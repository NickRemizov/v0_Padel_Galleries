"""
Training Storage

Functions for saving/loading HNSW index and related data.
"""

import os
import json

import logging

logger = logging.getLogger(__name__)

# Default paths
MODELS_DIR = '/home/nickr/python/models'
INDEX_FILENAME = 'players_index.bin'
MAP_FILENAME = 'player_ids_map.json'


async def save_index(face_service, models_dir: str = None):
    """
    Save HNSW index and ID map to disk.
    
    Args:
        face_service: FaceRecognitionService instance with index
        models_dir: Directory to save files (default: /home/nickr/python/models)
    """
    if models_dir is None:
        models_dir = MODELS_DIR
    
    os.makedirs(models_dir, exist_ok=True)
    
    index_path = os.path.join(models_dir, INDEX_FILENAME)
    map_path = os.path.join(models_dir, MAP_FILENAME)
    
    face_service.players_index.save_index(index_path)
    
    with open(map_path, 'w') as f:
        json.dump(face_service.player_ids_map, f)
    
    logger.info(f"Index saved to {index_path}")
    logger.info(f"Player IDs map saved to {map_path}")


def load_index(face_service, models_dir: str = None) -> bool:
    """
    Load HNSW index and ID map from disk.
    
    Args:
        face_service: FaceRecognitionService instance
        models_dir: Directory to load files from
    
    Returns:
        True if loaded successfully, False otherwise
    """
    if models_dir is None:
        models_dir = MODELS_DIR
    
    index_path = os.path.join(models_dir, INDEX_FILENAME)
    map_path = os.path.join(models_dir, MAP_FILENAME)
    
    if not os.path.exists(index_path) or not os.path.exists(map_path):
        logger.warning(f"Index files not found in {models_dir}")
        return False
    
    try:
        import hnswlib
        
        face_service.players_index = hnswlib.Index(space='cosine', dim=512)
        face_service.players_index.load_index(index_path)
        
        with open(map_path, 'r') as f:
            face_service.player_ids_map = json.load(f)
        
        logger.info(f"Index loaded from {index_path}")
        logger.info(f"Player IDs map loaded: {len(face_service.player_ids_map)} entries")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load index: {e}")
        return False
