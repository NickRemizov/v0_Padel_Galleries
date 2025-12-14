"""
Galleries repository - handles galleries and gallery_images tables.
"""

from typing import Optional, List, Dict, Any
from datetime import date

from repositories.base import BaseRepository
from models.domain.gallery import Gallery, GalleryImage, GalleryStatus
from core.exceptions import GalleryNotFoundError
from core.logging import get_logger

logger = get_logger(__name__)


class GalleriesRepository(BaseRepository):
    """
    Repository for galleries table.
    """
    
    table_name = "galleries"
    model_class = Gallery
    
    # ============================================================
    # Query Methods
    # ============================================================
    
    async def get_recent(
        self,
        limit: int = 20,
        offset: int = 0,
        include_stats: bool = False
    ) -> List[Gallery]:
        """
        Get recent galleries ordered by shoot_date.
        """
        try:
            response = (
                self.table
                .select("*")
                .order("shoot_date", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
            
            galleries = [self._to_model(row) for row in response.data]
            
            if include_stats:
                for gallery in galleries:
                    stats = await self._get_gallery_stats(gallery.id)
                    gallery.photos_count = stats.get("photos_count", 0)
                    gallery.processed_count = stats.get("processed_count", 0)
                    gallery.faces_count = stats.get("faces_count", 0)
            
            return galleries
            
        except Exception as e:
            self._handle_error("get_recent", e)
    
    async def search(
        self,
        query: str,
        limit: int = 20
    ) -> List[Gallery]:
        """
        Search galleries by title.
        """
        try:
            response = (
                self.table
                .select("*")
                .ilike("title", f"%{query}%")
                .order("shoot_date", desc=True)
                .limit(limit)
                .execute()
            )
            
            return [self._to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("search", e)
    
    async def get_by_date_range(
        self,
        date_from: date,
        date_to: date
    ) -> List[Gallery]:
        """
        Get galleries within date range.
        """
        try:
            response = (
                self.table
                .select("*")
                .gte("shoot_date", date_from.isoformat())
                .lte("shoot_date", date_to.isoformat())
                .order("shoot_date", desc=True)
                .execute()
            )
            
            return [self._to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("get_by_date_range", e)
    
    async def get_with_problems(self) -> List[Dict]:
        """
        Get galleries with processing issues (flag mismatches).
        """
        try:
            # Get all galleries with images
            response = (
                self.table
                .select(
                    "id, title, shoot_date, "
                    "gallery_images(id, has_been_processed)"
                )
                .order("shoot_date", desc=True)
                .execute()
            )
            
            problem_galleries = []
            
            for gallery in response.data:
                images = gallery.get("gallery_images") or []
                total = len(images)
                processed = sum(1 for img in images if img.get("has_been_processed"))
                
                if processed < total:
                    problem_galleries.append({
                        "id": gallery["id"],
                        "title": gallery["title"],
                        "shoot_date": gallery["shoot_date"],
                        "total_photos": total,
                        "processed_photos": processed,
                        "unprocessed": total - processed
                    })
            
            return problem_galleries
            
        except Exception as e:
            self._handle_error("get_with_problems", e)
    
    # ============================================================
    # Gallery Images
    # ============================================================
    
    async def get_images(
        self,
        gallery_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[GalleryImage]:
        """
        Get images in a gallery.
        """
        try:
            response = (
                self.client.client.table("gallery_images")
                .select("*")
                .eq("gallery_id", gallery_id)
                .order("original_filename")
                .range(offset, offset + limit - 1)
                .execute()
            )
            
            return [self._image_to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("get_images", e)
    
    async def get_image_by_id(self, image_id: str) -> Optional[GalleryImage]:
        """
        Get single image by ID.
        """
        try:
            response = (
                self.client.client.table("gallery_images")
                .select("*")
                .eq("id", image_id)
                .execute()
            )
            
            if not response.data:
                return None
            
            return self._image_to_model(response.data[0])
            
        except Exception as e:
            self._handle_error("get_image_by_id", e)
    
    async def update_image_processed(
        self,
        image_id: str,
        has_been_processed: bool
    ) -> GalleryImage:
        """
        Update image processing flag.
        """
        try:
            response = (
                self.client.client.table("gallery_images")
                .update({"has_been_processed": has_been_processed})
                .eq("id", image_id)
                .execute()
            )
            
            if not response.data:
                raise GalleryNotFoundError(image_id)
            
            return self._image_to_model(response.data[0])
            
        except Exception as e:
            self._handle_error("update_image_processed", e)
    
    # ============================================================
    # Statistics
    # ============================================================
    
    async def _get_gallery_stats(self, gallery_id: str) -> Dict:
        """
        Get statistics for a gallery.
        """
        try:
            # Photo count
            photos = (
                self.client.client.table("gallery_images")
                .select("id, has_been_processed", count="exact")
                .eq("gallery_id", gallery_id)
                .execute()
            )
            
            photos_count = photos.count or 0
            processed_count = sum(
                1 for p in photos.data 
                if p.get("has_been_processed")
            )
            
            # Face count
            if photos.data:
                photo_ids = [p["id"] for p in photos.data]
                faces = (
                    self.client.client.table("photo_faces")
                    .select("id", count="exact")
                    .in_("photo_id", photo_ids)
                    .execute()
                )
                faces_count = faces.count or 0
            else:
                faces_count = 0
            
            return {
                "photos_count": photos_count,
                "processed_count": processed_count,
                "faces_count": faces_count
            }
            
        except Exception as e:
            logger.error(f"Failed to get gallery stats: {e}")
            return {"photos_count": 0, "processed_count": 0, "faces_count": 0}
    
    # ============================================================
    # Model Conversion
    # ============================================================
    
    def _to_model(self, data: Dict) -> Gallery:
        """Convert database row to Gallery model."""
        return Gallery(
            id=data["id"],
            title=data.get("title", ""),
            description=data.get("description"),
            shoot_date=data.get("shoot_date"),
            location_id=data.get("location_id"),
            organizer_id=data.get("organizer_id"),
            photographer_id=data.get("photographer_id"),
            status=GalleryStatus(data.get("status", "draft")),
            is_public=data.get("is_public", False),
            photos_count=data.get("photos_count", 0),
            processed_count=data.get("processed_count", 0),
            faces_count=data.get("faces_count", 0),
            people_count=data.get("people_count", 0),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at")
        )
    
    def _image_to_model(self, data: Dict) -> GalleryImage:
        """Convert database row to GalleryImage model."""
        return GalleryImage(
            id=data["id"],
            gallery_id=data["gallery_id"],
            image_url=data.get("image_url", ""),
            thumbnail_url=data.get("thumbnail_url"),
            original_filename=data.get("original_filename"),
            width=data.get("width"),
            height=data.get("height"),
            has_been_processed=data.get("has_been_processed", False),
            faces_count=data.get("faces_count", 0),
            created_at=data.get("created_at")
        )
