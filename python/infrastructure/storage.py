"""
File storage operations.
Handles photo caching and file management.
"""

import os
import hashlib
from typing import Optional, Dict
import httpx
import cv2
import numpy as np

from core.config import settings
from core.logging import get_logger
from core.exceptions import ValidationError

logger = get_logger(__name__)


class PhotoCache:
    """
    Photo caching service.
    Downloads and caches photos locally for processing.
    """
    
    def __init__(self, cache_dir: str = None):
        self.cache_dir = cache_dir or os.path.join(settings.cache_dir, "photos")
        os.makedirs(self.cache_dir, exist_ok=True)
        self._url_to_path: Dict[str, str] = {}
        logger.info(f"PhotoCache initialized at {self.cache_dir}")
    
    def _get_cache_path(self, url: str) -> str:
        """Generate cache file path from URL."""
        filename = hashlib.md5(url.encode()).hexdigest() + ".jpg"
        return os.path.join(self.cache_dir, filename)
    
    def get_cached(self, url: str) -> Optional[str]:
        """Get cached file path if exists."""
        path = self._get_cache_path(url)
        if os.path.exists(path):
            return path
        return self._url_to_path.get(url)
    
    async def download(self, url: str) -> np.ndarray:
        """
        Download photo and return as numpy array.
        Uses cache if available.
        
        Args:
            url: Photo URL
        
        Returns:
            Image as numpy array (BGR format)
        """
        # Check cache first
        cached_path = self.get_cached(url)
        if cached_path and os.path.exists(cached_path):
            logger.debug(f"Using cached photo: {cached_path}")
            return cv2.imread(cached_path)
        
        # Download
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=30.0)
                response.raise_for_status()
                
                # Save to cache
                local_path = self._get_cache_path(url)
                with open(local_path, "wb") as f:
                    f.write(response.content)
                
                self._url_to_path[url] = local_path
                logger.debug(f"Downloaded and cached: {local_path}")
                
                return cv2.imread(local_path)
                
        except httpx.HTTPError as e:
            logger.error(f"Failed to download photo: {url} - {e}")
            raise ValidationError(f"Failed to download photo: {e}")
    
    def clear_cache(self, max_age_days: int = 7):
        """Remove old cached files."""
        import time
        now = time.time()
        max_age_seconds = max_age_days * 24 * 60 * 60
        
        removed = 0
        for filename in os.listdir(self.cache_dir):
            filepath = os.path.join(self.cache_dir, filename)
            if os.path.isfile(filepath):
                age = now - os.path.getmtime(filepath)
                if age > max_age_seconds:
                    os.remove(filepath)
                    removed += 1
        
        logger.info(f"Cleared {removed} cached files older than {max_age_days} days")
        return removed


# Global instance
_photo_cache: Optional[PhotoCache] = None

def get_photo_cache() -> PhotoCache:
    """Get singleton PhotoCache instance."""
    global _photo_cache
    if _photo_cache is None:
        _photo_cache = PhotoCache()
    return _photo_cache


# ============================================================
# Image Processing Utilities
# ============================================================

def decode_image(image_bytes: bytes) -> np.ndarray:
    """
    Decode image from bytes to numpy array.
    
    Args:
        image_bytes: Raw image bytes
    
    Returns:
        Image as numpy array (BGR format)
    
    Raises:
        ValidationError: If image cannot be decoded
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if image is None:
        raise ValidationError("Failed to decode image")
    
    return image


def encode_image(image: np.ndarray, format: str = "jpg", quality: int = 90) -> bytes:
    """
    Encode numpy array to image bytes.
    
    Args:
        image: Image as numpy array
        format: Output format (jpg, png)
        quality: JPEG quality (1-100)
    
    Returns:
        Encoded image bytes
    """
    if format.lower() == "jpg":
        params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        success, encoded = cv2.imencode(".jpg", image, params)
    else:
        success, encoded = cv2.imencode(f".{format}", image)
    
    if not success:
        raise ValidationError(f"Failed to encode image as {format}")
    
    return encoded.tobytes()


def resize_image(image: np.ndarray, max_size: int = 1920) -> np.ndarray:
    """
    Resize image if larger than max_size.
    Maintains aspect ratio.
    
    Args:
        image: Input image
        max_size: Maximum dimension
    
    Returns:
        Resized image (or original if smaller)
    """
    h, w = image.shape[:2]
    if max(h, w) <= max_size:
        return image
    
    scale = max_size / max(h, w)
    new_w = int(w * scale)
    new_h = int(h * scale)
    
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
