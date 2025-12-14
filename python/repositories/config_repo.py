"""
Config repository - handles face_recognition_config table.
"""

from typing import Optional, Dict, Any

from repositories.base import BaseRepository
from models.domain.training import TrainingConfig
from core.exceptions import DatabaseError
from core.logging import get_logger

logger = get_logger(__name__)


class ConfigRepository(BaseRepository):
    """
    Repository for face_recognition_config table.
    Handles application configuration stored in database.
    """
    
    table_name = "face_recognition_config"
    
    # ============================================================
    # Generic Config Operations
    # ============================================================
    
    async def get(self, key: str) -> Optional[Any]:
        """
        Get config value by key.
        """
        try:
            response = (
                self.table
                .select("value")
                .eq("key", key)
                .execute()
            )
            
            if not response.data:
                return None
            
            return response.data[0].get("value")
            
        except Exception as e:
            self._handle_error("get", e)
    
    async def set(self, key: str, value: Any) -> None:
        """
        Set config value (upsert).
        """
        try:
            self.table.upsert(
                {"key": key, "value": value},
                on_conflict="key"
            ).execute()
            
            logger.info(f"Config updated: {key}")
            
        except Exception as e:
            self._handle_error("set", e)
    
    async def get_all(self) -> Dict[str, Any]:
        """
        Get all config as dictionary.
        """
        try:
            response = self.table.select("key, value").execute()
            
            return {
                row["key"]: row["value"]
                for row in response.data
            }
            
        except Exception as e:
            self._handle_error("get_all", e)
    
    # ============================================================
    # Recognition Config
    # ============================================================
    
    async def get_recognition_config(self) -> TrainingConfig:
        """
        Get recognition/training configuration.
        Returns defaults merged with stored values.
        """
        try:
            stored = await self.get("recognition_settings")
            
            # Start with defaults
            config = TrainingConfig()
            
            if stored:
                # Merge stored values
                if "confidence_thresholds" in stored:
                    config.confidence_thresholds.update(stored["confidence_thresholds"])
                if "quality_filters" in stored:
                    config.quality_filters.update(stored["quality_filters"])
                if "context_weight" in stored:
                    config.context_weight = stored["context_weight"]
                if "min_faces_per_person" in stored:
                    config.min_faces_per_person = stored["min_faces_per_person"]
                if "auto_retrain_threshold" in stored:
                    config.auto_retrain_threshold = stored["auto_retrain_threshold"]
                if "auto_retrain_percentage" in stored:
                    config.auto_retrain_percentage = stored["auto_retrain_percentage"]
            
            return config
            
        except Exception as e:
            logger.error(f"Failed to get recognition config: {e}")
            return TrainingConfig()  # Return defaults on error
    
    async def update_recognition_config(self, updates: Dict[str, Any]) -> TrainingConfig:
        """
        Update recognition configuration.
        Merges updates with existing config.
        """
        try:
            # Get current config
            current = await self.get("recognition_settings") or {}
            
            # Deep merge updates
            for key, value in updates.items():
                if isinstance(value, dict) and key in current:
                    current[key].update(value)
                else:
                    current[key] = value
            
            # Save
            await self.set("recognition_settings", current)
            
            return await self.get_recognition_config()
            
        except Exception as e:
            self._handle_error("update_recognition_config", e)
    
    # ============================================================
    # Quality Thresholds
    # ============================================================
    
    async def get_quality_filters(self) -> Dict[str, float]:
        """
        Get quality filter thresholds.
        """
        config = await self.get_recognition_config()
        return config.quality_filters
    
    async def get_confidence_threshold(self, data_level: str = "high_data") -> float:
        """
        Get confidence threshold for given data level.
        
        Args:
            data_level: 'low_data', 'medium_data', or 'high_data'
        """
        config = await self.get_recognition_config()
        return config.confidence_thresholds.get(data_level, 0.6)
