"""
Faces repository - handles photo_faces table operations.
"""

from typing import Optional, List, Dict, Any
import numpy as np

from repositories.base import BaseRepository
from models.domain.face import Face, BoundingBox, FaceQuality
from core.exceptions import DatabaseError, FaceNotFoundError
from core.logging import get_logger

logger = get_logger(__name__)


class FacesRepository(BaseRepository):
    """
    Repository for photo_faces table.
    """
    
    table_name = "photo_faces"
    model_class = Face
    
    # ============================================================
    # Query Methods
    # ============================================================
    
    async def get_by_photo(self, photo_id: str) -> List[Face]:
        """
        Get all faces in a photo.
        """
        try:
            response = self.table.select("*").eq("photo_id", photo_id).execute()
            return [self._to_model(row) for row in response.data]
        except Exception as e:
            self._handle_error("get_by_photo", e)
    
    async def get_by_person(self, person_id: str, limit: int = 100) -> List[Face]:
        """
        Get all faces for a person.
        """
        try:
            response = (
                self.table
                .select("*")
                .eq("person_id", person_id)
                .limit(limit)
                .execute()
            )
            return [self._to_model(row) for row in response.data]
        except Exception as e:
            self._handle_error("get_by_person", e)
    
    async def get_unknown_in_gallery(self, gallery_id: str) -> List[Face]:
        """
        Get unknown faces (person_id = NULL) in a gallery.
        """
        try:
            # First get photo IDs in gallery
            photos_response = (
                self.client.client.table("gallery_images")
                .select("id")
                .eq("gallery_id", gallery_id)
                .execute()
            )
            
            if not photos_response.data:
                return []
            
            photo_ids = [p["id"] for p in photos_response.data]
            
            # Get unknown faces with descriptors
            response = (
                self.table
                .select("*")
                .in_("photo_id", photo_ids)
                .is_("person_id", "null")
                .not_.is_("insightface_descriptor", "null")
                .execute()
            )
            
            return [self._to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("get_unknown_in_gallery", e)
    
    async def get_verified(
        self,
        person_ids: List[str] = None,
        gallery_ids: List[str] = None,
        limit: int = 10000
    ) -> List[Face]:
        """
        Get verified faces with optional filters.
        """
        try:
            query = (
                self.table
                .select("*")
                .eq("verified", True)
                .not_.is_("person_id", "null")
            )
            
            if person_ids:
                query = query.in_("person_id", person_ids)
            
            # TODO: filter by gallery_ids through join
            
            query = query.limit(limit)
            response = query.execute()
            
            return [self._to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("get_verified", e)
    
    async def get_verified_with_descriptors(
        self,
        min_faces_per_person: int = 3
    ) -> List[Dict]:
        """
        Get all verified faces with descriptors for training.
        Uses pagination to load all data.
        """
        try:
            all_data = []
            page_size = 1000
            offset = 0
            
            while True:
                response = (
                    self.table
                    .select(
                        "id, person_id, insightface_descriptor, insightface_bbox, "
                        "insightface_confidence, photo_id"
                    )
                    .eq("verified", True)
                    .not_.is_("insightface_descriptor", "null")
                    .not_.is_("person_id", "null")
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                
                if not response.data:
                    break
                
                all_data.extend(response.data)
                
                if len(response.data) < page_size:
                    break
                
                offset += page_size
            
            logger.info(f"Loaded {len(all_data)} verified faces with descriptors")
            return all_data
            
        except Exception as e:
            self._handle_error("get_verified_with_descriptors", e)
    
    # ============================================================
    # Write Methods
    # ============================================================
    
    async def save_face(
        self,
        photo_id: str,
        bbox: BoundingBox,
        descriptor: np.ndarray = None,
        confidence: float = None,
        quality: FaceQuality = None
    ) -> Face:
        """
        Save a new detected face.
        """
        try:
            data = {
                "photo_id": photo_id,
                "insightface_bbox": bbox.model_dump(),
                "verified": False,
            }
            
            if descriptor is not None:
                data["insightface_descriptor"] = self.client.numpy_to_list(descriptor)
            
            if confidence is not None:
                data["insightface_confidence"] = float(confidence)
            
            if quality is not None:
                data["detection_score"] = quality.detection_score
                data["blur_score"] = quality.blur_score
            
            return await self.create(data)
            
        except Exception as e:
            self._handle_error("save_face", e)
    
    async def update_descriptor(
        self,
        face_id: str,
        descriptor: np.ndarray,
        confidence: float,
        bbox: BoundingBox = None
    ) -> Face:
        """
        Update face descriptor and confidence.
        """
        try:
            data = {
                "insightface_descriptor": self.client.numpy_to_list(descriptor),
                "insightface_confidence": float(confidence),
            }
            
            if bbox is not None:
                data["insightface_bbox"] = bbox.model_dump()
            
            return await self.update(face_id, data)
            
        except Exception as e:
            self._handle_error("update_descriptor", e)
    
    async def assign_person(
        self,
        face_id: str,
        person_id: str,
        confidence: float = None,
        verified: bool = False,
        verified_by: str = None
    ) -> Face:
        """
        Assign a person to a face.
        """
        try:
            data = {
                "person_id": person_id,
                "verified": verified,
            }
            
            if confidence is not None:
                data["recognition_confidence"] = float(confidence)
            
            if verified and verified_by:
                data["verified_by"] = verified_by
            
            return await self.update(face_id, data)
            
        except Exception as e:
            self._handle_error("assign_person", e)
    
    async def bulk_assign_person(
        self,
        face_ids: List[str],
        person_id: str,
        verified: bool = False
    ) -> int:
        """
        Assign person to multiple faces.
        Returns number of updated faces.
        """
        try:
            data = {
                "person_id": person_id,
                "verified": verified,
            }
            
            response = (
                self.table
                .update(data)
                .in_("id", face_ids)
                .execute()
            )
            
            return len(response.data)
            
        except Exception as e:
            self._handle_error("bulk_assign_person", e)
    
    # ============================================================
    # Model Conversion
    # ============================================================
    
    def _to_model(self, data: Dict) -> Face:
        """
        Convert database row to Face model.
        """
        # Parse bbox
        bbox_data = data.get("insightface_bbox") or {}
        if isinstance(bbox_data, str):
            import json
            bbox_data = json.loads(bbox_data)
        
        bbox = BoundingBox(
            x=bbox_data.get("x", 0),
            y=bbox_data.get("y", 0),
            width=bbox_data.get("width", 0),
            height=bbox_data.get("height", 0)
        )
        
        # Parse quality
        quality = None
        if data.get("insightface_confidence") is not None:
            quality = FaceQuality(
                detection_score=data.get("insightface_confidence", 0),
                blur_score=data.get("blur_score"),
                face_size=int(bbox.width) if bbox.width else None
            )
        
        return Face(
            id=data["id"],
            photo_id=data["photo_id"],
            person_id=data.get("person_id"),
            bbox=bbox,
            quality=quality,
            descriptor=data.get("insightface_descriptor"),
            recognition_confidence=data.get("recognition_confidence"),
            verified=data.get("verified", False),
            verified_at=data.get("verified_at"),
            verified_by=data.get("verified_by"),
            created_at=data.get("created_at"),
            training_used=data.get("training_used", False)
        )
