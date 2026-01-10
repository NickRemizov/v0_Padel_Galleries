"""
People API - Avatar & Visibility Operations
Endpoints for updating avatar and visibility settings
"""

from fastapi import APIRouter, Query, Body
from uuid import UUID
from typing import Optional
import httpx
import io

from PIL import Image

from core.responses import ApiResponse
from core.exceptions import NotFoundError, ValidationError, DatabaseError
from core.logging import get_logger
from infrastructure.minio_storage import get_minio_storage
from services.birefnet_service import get_birefnet_service

from .models import VisibilityUpdate
from .helpers import get_supabase_db, convert_bbox_to_array

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


@router.post("/{identifier:uuid}/generate-avatar")
async def generate_avatar(
    identifier: UUID,
    face_id: Optional[str] = Body(None, description="Face ID to use for cropping"),
    source_url: Optional[str] = Body(None, description="Direct image URL (full body/portrait)"),
    width: Optional[int] = Body(None, description="Target width (default: original)"),
    height: Optional[int] = Body(None, description="Target height (default: original)"),
    padding: Optional[float] = Body(0.3, description="Padding around face (0.3 = 30%)")
):
    """
    Generate avatar with transparent background using BiRefNet.

    REQUIRED: Either face_id OR source_url must be provided.
    User explicitly chooses the source image.

    Args:
        face_id: Uses the photo and bbox from this face (crops around face with padding)
        source_url: Uses this image directly (full body/portrait, no cropping)
        width: Target output width in pixels (optional)
        height: Target output height in pixels (optional)
        padding: Padding ratio around face when using face_id (default 0.3 = 30%)

    Process:
    1. Get source image (from face bbox or URL)
    2. Remove background with BiRefNet
    3. Resize to target dimensions (if specified)
    4. Save PNG to MinIO (avatars bucket)
    5. Create record in person_avatars table
    6. Update people.avatar_url to new avatar

    Returns:
        Avatar URL and metadata
    """
    supabase_db = get_supabase_db()
    minio = get_minio_storage()
    birefnet = get_birefnet_service()

    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)

        # Get person info
        person_result = supabase_db.client.table("people").select(
            "id, real_name, telegram_full_name"
        ).eq("id", person_id).execute()

        if not person_result.data:
            raise NotFoundError("Person", str(identifier))

        person = person_result.data[0]
        person_name = person.get("real_name") or person.get("telegram_full_name") or "user"

        # Require explicit source selection
        if not face_id and not source_url:
            raise ValidationError("Either face_id or source_url must be provided")

        source_face_id = None
        source_photo_id = None
        image_bytes = None

        if source_url:
            # Direct URL provided - use full image
            logger.info(f"Generating avatar from URL: {source_url}")
            async with httpx.AsyncClient() as client:
                response = await client.get(source_url, timeout=30)
                response.raise_for_status()
                image_bytes = response.content

        elif face_id:
            # Use specific face with bbox cropping
            face_result = supabase_db.client.table("photo_faces").select(
                "id, photo_id, insightface_bbox, gallery_images(image_url)"
            ).eq("id", face_id).execute()

            if not face_result.data:
                raise NotFoundError("Face", face_id)

            face = face_result.data[0]
            source_face_id = face["id"]
            source_photo_id = face["photo_id"]
            image_url = face.get("gallery_images", {}).get("image_url") if face.get("gallery_images") else None
            bbox = convert_bbox_to_array(face.get("insightface_bbox"))

            if not image_url:
                raise ValidationError("Face has no associated image")

            # Download image
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url, timeout=30)
                response.raise_for_status()
                full_image = response.content

            # Crop around face with specified padding
            if bbox:
                image_bytes = birefnet.crop_face_from_image(full_image, bbox, padding=padding or 0.3)
            else:
                image_bytes = full_image

            logger.info(f"Using face {face_id} with padding {padding}")

        if not image_bytes:
            raise ValidationError("Could not get source image")

        # Remove background with BiRefNet
        logger.info(f"Removing background for person {person_id}...")
        avatar_bytes = birefnet.remove_background_from_bytes(image_bytes)

        if not avatar_bytes:
            raise DatabaseError("Background removal failed", operation="birefnet")

        # Get original dimensions and resize if needed
        img = Image.open(io.BytesIO(avatar_bytes))
        orig_w, orig_h = img.size
        final_w, final_h = orig_w, orig_h

        if width or height:
            if width and height:
                # Both specified - resize to exact dimensions
                final_w, final_h = width, height
            elif width:
                # Only width - maintain aspect ratio
                ratio = width / orig_w
                final_w, final_h = width, int(orig_h * ratio)
            else:
                # Only height - maintain aspect ratio
                ratio = height / orig_h
                final_w, final_h = int(orig_w * ratio), height

            img = img.resize((final_w, final_h), Image.LANCZOS)
            output = io.BytesIO()
            img.save(output, format='PNG')
            avatar_bytes = output.getvalue()
            logger.info(f"Resized avatar from {orig_w}x{orig_h} to {final_w}x{final_h}")

        # Upload to MinIO
        from core.slug import to_slug
        slug = to_slug(person_name, max_length=50) or "user"
        filename = f"{slug}_avatar.png"

        upload_result = minio.upload_file(
            file_data=avatar_bytes,
            filename=filename,
            content_type="image/png",
            folder="avatars"
        )

        avatar_url = upload_result["url"]
        object_name = upload_result["object_name"]

        # Set existing primary avatars to non-primary
        supabase_db.client.table("person_avatars").update({
            "is_primary": False
        }).eq("person_id", person_id).eq("is_primary", True).execute()

        # Create person_avatars record
        avatar_record = supabase_db.client.table("person_avatars").insert({
            "person_id": person_id,
            "avatar_url": avatar_url,
            "object_name": object_name,
            "source_photo_id": source_photo_id,
            "source_face_id": source_face_id,
            "is_primary": True
        }).execute()

        # Update people.avatar_url
        supabase_db.client.table("people").update({
            "avatar_url": avatar_url
        }).eq("id", person_id).execute()

        logger.info(f"Generated avatar for person {person_id}: {avatar_url}")

        return ApiResponse.ok({
            "avatar_url": avatar_url,
            "avatar_id": avatar_record.data[0]["id"] if avatar_record.data else None,
            "source_face_id": source_face_id,
            "source_photo_id": source_photo_id,
            "width": final_w,
            "height": final_h
        })

    except (NotFoundError, ValidationError):
        raise
    except Exception as e:
        logger.error(f"Error generating avatar: {e}")
        raise DatabaseError(str(e), operation="generate_avatar")
