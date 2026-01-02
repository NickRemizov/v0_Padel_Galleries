"""
People API - Avatar & Visibility Operations
Endpoints for updating avatar and visibility settings
"""

from fastapi import APIRouter, Query
from uuid import UUID
import numpy as np
import json

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger

from .models import VisibilityUpdate
from .helpers import get_supabase_db

logger = get_logger(__name__)
router = APIRouter()


def _get_person_id_from_uuid(supabase_db, person_uuid: UUID) -> str:
    """Get person ID from UUID. Raises NotFoundError if not found."""
    result = supabase_db.client.table("people").select("id").eq("id", str(person_uuid)).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]["id"]
    raise NotFoundError("Person", str(person_uuid))


@router.patch("/{identifier:uuid}/avatar")
async def update_avatar(identifier: UUID, avatar_url: str = Query(...)):
    """Update person's avatar."""
    supabase_db = get_supabase_db()

    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)

        result = supabase_db.client.table("people").update({"avatar_url": avatar_url}).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Updated avatar for person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", str(identifier))
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating avatar: {e}")
        raise DatabaseError(str(e), operation="update_avatar")


@router.delete("/{identifier:uuid}/avatar")
async def delete_avatar(identifier: UUID):
    """Delete person's avatar (set to null)."""
    supabase_db = get_supabase_db()

    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)

        result = supabase_db.client.table("people").update({"avatar_url": None}).eq("id", person_id).execute()
        if result.data:
            logger.info(f"Deleted avatar for person {person_id}")
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", str(identifier))
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting avatar: {e}")
        raise DatabaseError(str(e), operation="delete_avatar")


@router.get("/{identifier:uuid}/best-face")
async def get_best_face_for_avatar(identifier: UUID):
    """
    Get the best face for avatar generation (closest to centroid).
    Returns image_url and bbox for the face.
    """
    supabase_db = get_supabase_db()

    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)

        # Get all faces for this person with descriptors
        faces_result = supabase_db.client.table("photo_faces").select(
            "id, photo_id, insightface_bbox, insightface_descriptor, gallery_images(image_url)"
        ).eq("person_id", person_id).eq("verified", True).execute()

        faces = faces_result.data or []
        if not faces:
            raise NotFoundError("Face", f"No verified faces found for person {identifier}")

        # Filter faces with valid descriptors and image URLs
        valid_faces = []
        embeddings = []
        for face in faces:
            descriptor = face.get("insightface_descriptor")
            image_url = face.get("gallery_images", {}).get("image_url") if face.get("gallery_images") else None
            bbox = face.get("insightface_bbox")

            if not descriptor or not image_url or not bbox:
                continue

            # Parse descriptor
            if isinstance(descriptor, str):
                try:
                    embedding = np.array(json.loads(descriptor), dtype=np.float32)
                except:
                    continue
            elif isinstance(descriptor, list):
                embedding = np.array(descriptor, dtype=np.float32)
            else:
                continue

            valid_faces.append({
                "id": face["id"],
                "image_url": image_url,
                "bbox": bbox,
                "embedding": embedding
            })
            embeddings.append(embedding)

        if not valid_faces:
            raise NotFoundError("Face", f"No valid faces with descriptors found for person {identifier}")

        # Calculate centroid
        embeddings_array = np.array(embeddings)
        centroid = np.mean(embeddings_array, axis=0)

        # Find face closest to centroid
        best_face = None
        best_distance = float("inf")
        for i, face in enumerate(valid_faces):
            distance = float(np.linalg.norm(face["embedding"] - centroid))
            if distance < best_distance:
                best_distance = distance
                best_face = face

        if not best_face:
            raise NotFoundError("Face", f"Could not find best face for person {identifier}")

        logger.info(f"Found best face for person {person_id}: distance_to_centroid={best_distance:.4f}")

        return ApiResponse.ok({
            "face_id": best_face["id"],
            "image_url": best_face["image_url"],
            "bbox": best_face["bbox"],
            "distance_to_centroid": round(best_distance, 4)
        })

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error getting best face: {e}")
        raise DatabaseError(str(e), operation="get_best_face")


@router.patch("/{identifier:uuid}/visibility")
async def update_visibility(identifier: UUID, data: VisibilityUpdate):
    """Update person's visibility settings."""
    supabase_db = get_supabase_db()
    
    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)
        
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            raise ValidationError("No fields to update")
        result = supabase_db.client.table("people").update(update_data).eq("id", person_id).execute()
        if result.data:
            return ApiResponse.ok(result.data[0])
        raise NotFoundError("Person", str(identifier))
    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error updating visibility: {e}")
        raise DatabaseError(str(e), operation="update_visibility")
