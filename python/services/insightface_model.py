"""
InsightFace model initialization and management.
Handles model unpacking and lazy initialization.
"""

import os
import zipfile
import shutil
import time
from pathlib import Path
from typing import Optional
import logging

from insightface.app import FaceAnalysis

logger = logging.getLogger(__name__)


class InsightFaceModel:
    """
    Manages InsightFace model lifecycle.
    Handles unpacking, initialization, and provides access to the model.
    """
    
    MODEL_NAME = 'antelopev2'
    
    def __init__(self):
        self.app: Optional[FaceAnalysis] = None
        self._initialized = False
    
    @property
    def is_ready(self) -> bool:
        """Check if model is initialized and ready"""
        return self._initialized and self.app is not None
    
    def _get_model_paths(self):
        """Get paths for model directory and zip file"""
        home_dir = Path.home()
        model_dir = home_dir / ".insightface" / "models" / self.MODEL_NAME
        model_zip = home_dir / ".insightface" / "models" / f"{self.MODEL_NAME}.zip"
        return model_dir, model_zip
    
    def _ensure_model_unpacked(self) -> bool:
        """
        Check and unpack antelopev2 model if needed.
        
        Returns:
            True if model is ready, False otherwise
        """
        model_dir, model_zip = self._get_model_paths()
        
        logger.info(f"Checking model {self.MODEL_NAME}...")
        logger.info(f"Model path: {model_dir}")
        logger.info(f"Zip path: {model_zip}")
        
        # Check if model is already unpacked
        if model_dir.exists():
            onnx_files = list(model_dir.glob("*.onnx"))
            if len(onnx_files) > 0:
                logger.info(f"Model already unpacked: {[f.name for f in onnx_files]}")
                return True
            logger.info("Model folder exists but is empty")
        
        # Check if zip exists
        if not model_zip.exists():
            logger.error(f"Model zip not found: {model_zip}")
            return False
        
        logger.info(f"Zip found, size: {model_zip.stat().st_size} bytes")
        logger.info("Starting model unpacking...")
        
        try:
            # Create directory
            model_dir.mkdir(parents=True, exist_ok=True)
            
            # Extract zip
            with zipfile.ZipFile(model_zip, 'r') as zip_ref:
                file_list = zip_ref.namelist()
                logger.info(f"Files in zip: {len(file_list)}")
                zip_ref.extractall(model_dir)
            
            # Handle nested folder structure
            subfolder = model_dir / self.MODEL_NAME
            if subfolder.exists() and subfolder.is_dir():
                logger.info("Found nested subfolder, moving files to root...")
                for item in subfolder.iterdir():
                    if item.is_file():
                        dest = model_dir / item.name
                        shutil.move(str(item), str(dest))
                subfolder.rmdir()
            
            # Verify extraction
            onnx_files = list(model_dir.glob("*.onnx"))
            if len(onnx_files) == 0:
                logger.error("No .onnx files found after unpacking!")
                return False
            
            logger.info(f"Model successfully unpacked: {[f.name for f in onnx_files]}")
            return True
            
        except Exception as e:
            logger.error(f"Error unpacking model: {type(e).__name__}: {e}")
            return False
    
    def initialize(self) -> bool:
        """
        Initialize InsightFace model.
        Performs lazy initialization - only loads model on first call.
        
        Returns:
            True if initialization successful
        """
        if self._initialized:
            return True
        
        logger.info("========== STARTING INSIGHTFACE INITIALIZATION ==========")
        
        try:
            model_dir, model_zip = self._get_model_paths()
            
            # Step 1: Check if model is ready
            model_ready = False
            if model_dir.exists():
                onnx_files = list(model_dir.glob("*.onnx"))
                if len(onnx_files) > 0:
                    logger.info(f"Model already unpacked: {len(onnx_files)} .onnx files")
                    model_ready = True
            
            # Step 2: Unpack if needed
            if not model_ready:
                if model_zip.exists():
                    logger.info("Zip found, unpacking...")
                    if not self._ensure_model_unpacked():
                        raise RuntimeError("Failed to unpack model zip")
                    model_ready = True
                else:
                    # Try to trigger InsightFace download
                    logger.info("Zip not found, triggering InsightFace download...")
                    try:
                        temp_app = FaceAnalysis(
                            name=self.MODEL_NAME,
                            providers=['CPUExecutionProvider']
                        )
                        del temp_app
                    except Exception as e:
                        logger.warning(f"Error creating temp FaceAnalysis: {e}")
                    
                    # Wait for download
                    max_wait = 30
                    waited = 0
                    while not model_zip.exists() and waited < max_wait:
                        logger.info(f"Waiting for model download... ({waited}s)")
                        time.sleep(2)
                        waited += 2
                    
                    if not model_zip.exists():
                        raise RuntimeError(f"Model not downloaded after {max_wait}s")
                    
                    if not self._ensure_model_unpacked():
                        raise RuntimeError("Failed to unpack downloaded model")
                    model_ready = True
            
            if not model_ready:
                raise RuntimeError("Model not ready after initialization attempts")
            
            # Step 3: Create FaceAnalysis
            logger.info("Creating FaceAnalysis...")
            self.app = FaceAnalysis(
                name=self.MODEL_NAME,
                providers=['CPUExecutionProvider']
            )
            logger.info("FaceAnalysis created successfully")
            
            # Step 4: Prepare model
            logger.info("Loading models into memory (prepare)...")
            self.app.prepare(ctx_id=-1, det_size=(640, 640))
            logger.info("prepare() completed successfully")
            
            # Step 5: Verify models loaded
            if hasattr(self.app, 'models'):
                models_list = list(self.app.models.keys())
                logger.info(f"Models loaded: {models_list}")
                
                if 'detection' not in models_list:
                    raise RuntimeError("'detection' model not loaded")
            
            self._initialized = True
            logger.info("========== INSIGHTFACE READY FOR USE ==========")
            return True
            
        except Exception as e:
            logger.error("========== CRITICAL INITIALIZATION ERROR ==========")
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Error message: {str(e)}")
            raise
    
    def get_faces(self, img_array):
        """
        Detect faces on image.
        
        Args:
            img_array: Image as numpy array (BGR format)
            
        Returns:
            List of detected faces from InsightFace
        """
        if not self._initialized:
            self.initialize()
        
        return self.app.get(img_array)


# Global singleton instance
_model_instance: Optional[InsightFaceModel] = None


def get_model() -> InsightFaceModel:
    """Get or create the global InsightFace model instance"""
    global _model_instance
    if _model_instance is None:
        _model_instance = InsightFaceModel()
    return _model_instance
