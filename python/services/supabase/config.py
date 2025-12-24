"""
Supabase Config Repository - Single source of truth for recognition config.

Consolidates duplicated get_config/get_recognition_config from both
supabase_client.py and supabase_database.py.
"""

from typing import Dict

from core.logging import get_logger
from .base import get_supabase_client

logger = get_logger(__name__)

# Default configuration values
DEFAULT_CONFIG = {
    'confidence_thresholds': {
        'low_data': 0.75,
        'medium_data': 0.65,
        'high_data': 0.60  # Unified default (was 0.55 in some places)
    },
    'context_weight': 0.10,
    'min_faces_per_person': 3,
    'auto_retrain_threshold': 25,
    'auto_retrain_percentage': 0.10,
    'quality_filters': {
        'min_detection_score': 0.70,
        'min_face_size': 80,
        'min_blur_score': 80
    }
}


class ConfigRepository:
    """Repository for face recognition configuration."""
    
    def __init__(self):
        self._client = get_supabase_client()
    
    def get_raw_config(self) -> Dict:
        """
        Get raw configuration from face_recognition_config table.
        
        Returns:
            Dict with config key-value pairs
        """
        try:
            response = self._client.table("face_recognition_config").select("key, value").execute()
            
            config = {}
            for row in response.data or []:
                config[row["key"]] = row["value"]
            
            logger.debug(f"Loaded {len(config)} config entries from DB")
            return config
            
        except Exception as e:
            logger.error(f"Error getting config: {e}")
            return {}
    
    def get_recognition_config(self) -> Dict:
        """
        Get recognition settings with defaults.
        
        Returns:
            Dict with merged config (DB values override defaults)
        """
        try:
            raw_config = self.get_raw_config()
            
            # Start with defaults
            result = {
                'confidence_thresholds': DEFAULT_CONFIG['confidence_thresholds'].copy(),
                'quality_filters': DEFAULT_CONFIG['quality_filters'].copy(),
                'context_weight': DEFAULT_CONFIG['context_weight'],
                'min_faces_per_person': DEFAULT_CONFIG['min_faces_per_person'],
                'auto_retrain_threshold': DEFAULT_CONFIG['auto_retrain_threshold'],
                'auto_retrain_percentage': DEFAULT_CONFIG['auto_retrain_percentage'],
            }
            
            # Merge with stored config
            if 'recognition_settings' in raw_config:
                stored = raw_config['recognition_settings']
                
                # Deep merge nested objects
                if 'confidence_thresholds' in stored:
                    result['confidence_thresholds'].update(stored['confidence_thresholds'])
                if 'quality_filters' in stored:
                    result['quality_filters'].update(stored['quality_filters'])
                
                # Update top-level fields
                for key in ['context_weight', 'min_faces_per_person', 
                           'auto_retrain_threshold', 'auto_retrain_percentage']:
                    if key in stored:
                        result[key] = stored[key]
            
            logger.debug(f"Recognition config: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error getting recognition config: {e}")
            return DEFAULT_CONFIG.copy()
    
    def update_config(self, key: str, value: Dict) -> bool:
        """
        Update configuration in face_recognition_config.
        
        Args:
            key: Config key (e.g., 'recognition_settings')
            value: Config value (dict)
            
        Returns:
            True if successful
        """
        try:
            self._client.table("face_recognition_config").upsert({
                "key": key,
                "value": value
            }, on_conflict='key').execute()
            
            logger.info(f"Updated config key '{key}'")
            return True
            
        except Exception as e:
            logger.error(f"Error updating config: {e}")
            return False
    
    def update_recognition_config(self, settings: Dict) -> bool:
        """
        Update recognition settings.
        
        Args:
            settings: Recognition settings dict
            
        Returns:
            True if successful
        """
        return self.update_config('recognition_settings', settings)


# Module-level instance for easy access
_config_repo: ConfigRepository = None


def get_config_repository() -> ConfigRepository:
    """Get ConfigRepository singleton."""
    global _config_repo
    if _config_repo is None:
        _config_repo = ConfigRepository()
    return _config_repo


def get_recognition_config() -> Dict:
    """Convenience function to get recognition config."""
    return get_config_repository().get_recognition_config()
