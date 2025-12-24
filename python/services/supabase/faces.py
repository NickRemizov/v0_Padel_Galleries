"""
Supabase Faces Repository - Face operations.

All methods are SYNC per ТЗ requirements:
"A) CRUD/обычные запросы: синхронные эндпоинты (def)
Причина: если внутри используется синхронный клиент БД/HTTP, 
async def только ухудшает (блокирует event loop)."

Supabase Python SDK is synchronous - async wrappers only hurt performance.
"""

from typing import List, Dict, Optional
import numpy as np
import json

from core.logging import get_logger
from .base import get_supabase_client

logger = get_logger(__name__)


class FacesRepository:
    """Repository for face-related database operations."""
    
    def __init__(self):
        self._client = None
    
    @property
    def client(self):
        if self._client is None:
            self._client = get_supabase_client()
        return self._client
    
    # =========================================================================
    # Unknown Faces Operations
    # =========================================================================
    
    def get_unknown_faces_from_gallery(self, gallery_id: str) -> List[Dict]:
        """
        Get unknown faces from a specific gallery (person_id = NULL).
        
        Args:
            gallery_id: Gallery UUID
            
        Returns:
            List of face dicts with photo info, descriptor, bbox
        """
        logger.info(f"[Faces] Getting unknown faces from gallery {gallery_id}")
        
        try:
            # Get all photo_ids from gallery
            photos_response = self.client.table("gallery_images").select(
                "id"
            ).eq("gallery_id", gallery_id).execute()
            
            if not photos_response.data:
                return []
            
            photo_ids = [p["id"] for p in photos_response.data]
            logger.info(f"[Faces] Found {len(photo_ids)} photos in gallery")
            
            # Get unknown faces with pagination (batch by photo_ids)
            all_faces = []
            batch_size = 100
            
            for i in range(0, len(photo_ids), batch_size):
                batch = photo_ids[i:i + batch_size]
                
                response = self.client.table("photo_faces").select(
                    "id, photo_id, insightface_descriptor, insightface_bbox, insightface_det_score, "
                    "gallery_images(id, image_url, width, height, gallery_id)"
                ).in_(
                    "photo_id", batch
                ).is_(
                    "person_id", "null"
                ).execute()
                
                if response.data:
                    # Filter: must have descriptor AND bbox
                    for face in response.data:
                        photo = face.get("gallery_images")
                        if not photo:
                            continue
                        if not face.get("insightface_descriptor"):
                            continue
                        if not face.get("insightface_bbox"):
                            continue
                        
                        all_faces.append({
                            "id": face["id"],
                            "photo_id": face["photo_id"],
                            "photo_url": photo["image_url"],
                            "width": photo.get("width"),
                            "height": photo.get("height"),
                            "insightface_descriptor": face["insightface_descriptor"],
                            "insightface_bbox": face["insightface_bbox"],
                            "insightface_det_score": face.get("insightface_det_score")
                        })
            
            logger.info(f"[Faces] Found {len(all_faces)} unknown faces in gallery")
            return all_faces
            
        except Exception as e:
            logger.error(f"[Faces] Error getting unknown faces: {e}")
            return []
    
    def get_all_unknown_faces(self) -> List[Dict]:
        """
        Get ALL unknown faces from database with pagination.
        Includes gallery info for each face.
        
        Returns:
            List of face dicts with gallery info
        """
        logger.info("[Faces] Loading ALL unknown faces from database...")
        
        try:
            all_faces = []
            page_size = 1000
            offset = 0
            
            while True:
                response = self.client.table("photo_faces").select(
                    "id, photo_id, insightface_descriptor, insightface_bbox, insightface_det_score, "
                    "gallery_images(id, image_url, width, height, gallery_id, "
                    "galleries(id, title, shoot_date))"
                ).is_(
                    "person_id", "null"
                ).range(offset, offset + page_size - 1).execute()
                
                if not response.data:
                    break
                
                # Filter: must have descriptor AND bbox
                for face in response.data:
                    photo = face.get("gallery_images")
                    if not photo:
                        continue
                    if not face.get("insightface_descriptor"):
                        continue
                    if not face.get("insightface_bbox"):
                        continue
                    
                    gallery = photo.get("galleries") or {}
                    
                    all_faces.append({
                        "id": face["id"],
                        "photo_id": face["photo_id"],
                        "photo_url": photo["image_url"],
                        "width": photo.get("width"),
                        "height": photo.get("height"),
                        "insightface_descriptor": face["insightface_descriptor"],
                        "insightface_bbox": face["insightface_bbox"],
                        "insightface_det_score": face.get("insightface_det_score"),
                        "gallery_id": photo.get("gallery_id"),
                        "gallery_title": gallery.get("title"),
                        "shoot_date": gallery.get("shoot_date")
                    })
                
                logger.debug(f"[Faces] Loaded page: offset={offset}, batch={len(response.data)}, total={len(all_faces)}")
                
                if len(response.data) < page_size:
                    break
                offset += page_size
            
            logger.info(f"[Faces] Total unknown faces loaded: {len(all_faces)}")
            return all_faces
            
        except Exception as e:
            logger.error(f"[Faces] Error getting all unknown faces: {e}")
            return []
    
    # =========================================================================
    # Cluster Rejection
    # =========================================================================
    
    def reject_face_cluster(
        self,
        descriptors: List[np.ndarray],
        gallery_id: str,
        photo_ids: List[str],
        rejected_by: str,
        reason: str = None
    ) -> bool:
        """
        Save rejected face cluster to rejected_faces table.
        These descriptors will be used to filter out similar faces in future.
        
        Args:
            descriptors: List of face embeddings to reject
            gallery_id: Gallery where faces were found
            photo_ids: Photo IDs where faces appear
            rejected_by: User ID who rejected the faces
            reason: Optional reason for rejection
            
        Returns:
            True if successful
        """
        logger.info(f"[Faces] Rejecting {len(descriptors)} faces from gallery {gallery_id}")
        
        try:
            for i, descriptor in enumerate(descriptors):
                photo_id = photo_ids[i] if i < len(photo_ids) else None
                
                # Convert numpy array to list if needed
                descriptor_list = descriptor.tolist() if isinstance(descriptor, np.ndarray) else descriptor
                
                self.client.table("rejected_faces").insert({
                    "descriptor": descriptor_list,
                    "gallery_id": gallery_id,
                    "photo_id": photo_id,
                    "rejected_by": rejected_by,
                    "reason": reason
                }).execute()
            
            logger.info(f"[Faces] ✓ Successfully rejected {len(descriptors)} faces")
            return True
            
        except Exception as e:
            logger.error(f"[Faces] Error rejecting faces: {e}")
            return False
    
    # =========================================================================
    # Recognition Result Update
    # =========================================================================
    
    def update_recognition_result(
        self,
        face_id: str,
        person_id: Optional[str],
        recognition_confidence: float,
        verified: bool = False,
        verified_by: Optional[str] = None
    ) -> bool:
        """
        Update face recognition result in photo_faces.
        
        Args:
            face_id: Face UUID
            person_id: Recognized person ID (None if not recognized)
            recognition_confidence: Classifier confidence (0-1)
            verified: Manual verification flag
            verified_by: Admin ID if verified=True
            
        Returns:
            True if successful
        """
        try:
            update_data = {
                "person_id": person_id,
                "recognition_confidence": float(recognition_confidence),
                "verified": verified
            }
            
            if verified and verified_by:
                update_data["verified_by"] = verified_by
            
            self.client.table("photo_faces").update(update_data).eq("id", face_id).execute()
            return True
            
        except Exception as e:
            logger.error(f"[Faces] Error updating recognition result: {e}")
            return False
    
    # =========================================================================
    # Exclusion from Index (for outlier detection)
    # =========================================================================
    
    def set_excluded_from_index(self, face_ids: List[str], excluded: bool = True) -> int:
        """
        Set excluded_from_index flag for multiple faces.
        Used by outlier detection to remove bad embeddings from HNSW index.
        
        Args:
            face_ids: List of photo_faces IDs to update
            excluded: True to exclude from index, False to include
            
        Returns:
            Number of faces updated
        """
        if not face_ids:
            return 0
        
        logger.info(f"[Faces] Setting excluded_from_index={excluded} for {len(face_ids)} faces")
        
        try:
            # Update in batches to avoid query limits
            batch_size = 100
            updated_count = 0
            
            for i in range(0, len(face_ids), batch_size):
                batch = face_ids[i:i + batch_size]
                
                response = self.client.table("photo_faces").update({
                    "excluded_from_index": excluded
                }).in_("id", batch).execute()
                
                if response.data:
                    updated_count += len(response.data)
            
            logger.info(f"[Faces] ✓ Updated {updated_count} faces")
            return updated_count
            
        except Exception as e:
            logger.error(f"[Faces] Error setting excluded_from_index: {e}")
            return 0
    
    # =========================================================================
    # Check if Face is Rejected
    # =========================================================================
    
    def is_face_rejected(
        self,
        embedding: np.ndarray,
        similarity_threshold: float = 0.85
    ) -> bool:
        """
        Check if face embedding matches any rejected face.
        High threshold (0.85) to avoid false positives.
        
        Args:
            embedding: 512-dim numpy array from InsightFace
            similarity_threshold: Minimum similarity to consider match
            
        Returns:
            True if face should be rejected
        """
        logger.debug(f"[Faces] Checking if face is rejected (threshold={similarity_threshold})")
        
        try:
            response = self.client.table("rejected_faces").select("descriptor").execute()
            
            if not response.data:
                return False
            
            embedding_norm = embedding / np.linalg.norm(embedding)
            
            for row in response.data:
                descriptor = row["descriptor"]
                
                if isinstance(descriptor, list):
                    rejected_embedding = np.array(descriptor, dtype=np.float32)
                elif isinstance(descriptor, str):
                    rejected_embedding = np.array(json.loads(descriptor), dtype=np.float32)
                else:
                    continue
                
                rejected_norm = rejected_embedding / np.linalg.norm(rejected_embedding)
                similarity = float(np.dot(embedding_norm, rejected_norm))
                
                if similarity >= similarity_threshold:
                    logger.info(f"[Faces] ✓ Face matches rejected face (similarity={similarity:.3f})")
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"[Faces] Error checking rejected faces: {e}")
            return False


# Singleton instance
_faces_repository: FacesRepository = None


def get_faces_repository() -> FacesRepository:
    """Get shared FacesRepository instance."""
    global _faces_repository
    if _faces_repository is None:
        _faces_repository = FacesRepository()
    return _faces_repository
