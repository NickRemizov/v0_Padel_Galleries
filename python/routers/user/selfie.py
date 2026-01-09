"""
Selfie Search Router

Allows new users to find their photos by uploading a selfie.
Uses face recognition to match against unknown faces in the database.
"""

import base64
import uuid
import io
import json
from typing import Optional, List
from datetime import datetime

import numpy as np
from PIL import Image
import cv2
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.logging import get_logger
from core.responses import ApiResponse
from infrastructure.supabase import get_supabase_client
from infrastructure.minio_storage import get_minio_storage
from services.face_recognition import FaceRecognitionService

logger = get_logger(__name__)
router = APIRouter()

# Lazy initialization
_face_service: Optional[FaceRecognitionService] = None


def get_face_service() -> FaceRecognitionService:
    """Get or create FaceRecognitionService singleton."""
    global _face_service
    if _face_service is None:
        _face_service = FaceRecognitionService()
    return _face_service


class SelfieSearchRequest(BaseModel):
    image_base64: str  # Base64 encoded image


class ConfirmSelfieRequest(BaseModel):
    photo_face_ids: List[str]  # IDs of confirmed photo_faces
    selfie_search_id: str  # ID of selfie_searches record


async def get_confidence_threshold() -> float:
    """Get confidence threshold from settings."""
    try:
        db = get_supabase_client().client
        result = db.table("face_recognition_config").select("value").eq(
            "key", "recognition_settings"
        ).single().execute()
        if result.data:
            return result.data.get("value", {}).get("confidence_thresholds", {}).get("high_data", 0.6)
    except Exception as e:
        logger.warning(f"Failed to get threshold: {e}")
    return 0.6


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors."""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


async def save_selfie_to_minio(user_id: str, image_bytes: bytes) -> str:
    """Save selfie image to MinIO and return URL."""
    minio = get_minio_storage()

    # Use avatars bucket for selfies (or could create selfies bucket)
    filename = f"selfie_{user_id}_{uuid.uuid4().hex[:8]}.jpg"

    result = minio.upload_file(
        file_data=image_bytes,
        filename=filename,
        content_type="image/jpeg",
        folder="avatars"  # Store in avatars bucket
    )

    return result["url"]


async def search_unknown_faces(
    descriptor: np.ndarray,
    threshold: float,
    limit: int = 50
) -> List[dict]:
    """
    Search for matching faces among unknown (person_id IS NULL).
    Returns list of matches with photo info.
    """
    db = get_supabase_client().client

    # Get all unknown faces with descriptors
    # Paginate to handle large datasets
    all_faces = []
    page_size = 1000
    offset = 0

    while True:
        result = db.table("photo_faces").select(
            "id, photo_id, insightface_descriptor"
        ).is_(
            "person_id", "null"
        ).not_.is_(
            "insightface_descriptor", "null"
        ).range(offset, offset + page_size - 1).execute()

        if not result.data:
            break
        all_faces.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size

    logger.info(f"[Selfie] Searching among {len(all_faces)} unknown faces")

    # Calculate similarities
    matches = []
    for face in all_faces:
        face_descriptor = face.get("insightface_descriptor")
        if not face_descriptor:
            continue

        # Convert descriptor
        if isinstance(face_descriptor, list):
            emb = np.array(face_descriptor, dtype=np.float32)
        elif isinstance(face_descriptor, str):
            emb = np.array(json.loads(face_descriptor), dtype=np.float32)
        else:
            continue

        if len(emb) != 512:
            continue

        similarity = cosine_similarity(descriptor, emb)
        if similarity >= threshold:
            matches.append({
                "photo_face_id": face["id"],
                "photo_id": face["photo_id"],
                "similarity": similarity
            })

    # Sort by similarity descending
    matches.sort(key=lambda x: x["similarity"], reverse=True)

    logger.info(f"[Selfie] Found {len(matches)} matches above threshold {threshold}")
    return matches[:limit]


async def check_collisions(
    descriptor: np.ndarray,
    threshold: float
) -> Optional[dict]:
    """
    Check if selfie matches any existing person (collision detection).
    Returns collision info if found.
    """
    db = get_supabase_client().client

    # Get faces with person_id (known faces)
    # Sample to avoid processing entire database
    result = db.table("photo_faces").select(
        "id, person_id, insightface_descriptor"
    ).not_.is_(
        "person_id", "null"
    ).not_.is_(
        "insightface_descriptor", "null"
    ).eq(
        "verified", True  # Only check against verified faces
    ).limit(5000).execute()

    if not result.data:
        return None

    logger.info(f"[Selfie] Checking collisions against {len(result.data)} verified faces")

    best_match = None
    best_similarity = 0.0

    for face in result.data:
        face_descriptor = face.get("insightface_descriptor")
        if not face_descriptor:
            continue

        if isinstance(face_descriptor, list):
            emb = np.array(face_descriptor, dtype=np.float32)
        elif isinstance(face_descriptor, str):
            emb = np.array(json.loads(face_descriptor), dtype=np.float32)
        else:
            continue

        if len(emb) != 512:
            continue

        similarity = cosine_similarity(descriptor, emb)
        if similarity >= threshold and similarity > best_similarity:
            best_similarity = similarity
            best_match = {
                "person_id": face["person_id"],
                "similarity": similarity
            }

    if best_match:
        logger.info(f"[Selfie] Collision detected: person_id={best_match['person_id']}, sim={best_match['similarity']:.3f}")

        # Get sample photos for this person
        photos_result = db.table("photo_faces").select(
            "photo_id, gallery_images(id, image_url)"
        ).eq(
            "person_id", best_match["person_id"]
        ).eq(
            "verified", True
        ).limit(3).execute()

        sample_photos = []
        for pf in (photos_result.data or []):
            if pf.get("gallery_images"):
                sample_photos.append({
                    "image_url": pf["gallery_images"].get("image_url")
                })

        best_match["sample_photos"] = sample_photos

    return best_match


@router.post("/selfie-search")
async def selfie_search(
    data: SelfieSearchRequest,
    user_id: str = Query(..., description="User ID")
) -> dict:
    """
    Search for user's photos using selfie.

    1. Saves selfie to MinIO
    2. Extracts face descriptor
    3. Searches among unknown faces (person_id IS NULL)
    4. Checks for collisions (person_id IS NOT NULL)
    5. Returns top 3 matches or collision info
    """
    logger.info(f"[Selfie] Search request from user {user_id}")

    try:
        # Decode base64 image
        try:
            # Handle data URL format
            if "," in data.image_base64:
                image_data = data.image_base64.split(",")[1]
            else:
                image_data = data.image_base64
            image_bytes = base64.b64decode(image_data)
        except Exception as e:
            logger.error(f"[Selfie] Failed to decode image: {e}")
            raise HTTPException(status_code=400, detail="Invalid image data")

        # Save to MinIO
        image_url = await save_selfie_to_minio(user_id, image_bytes)
        logger.info(f"[Selfie] Saved to {image_url}")

        # Extract face descriptor
        face_service = get_face_service()
        face_service._ensure_initialized()

        # Load image
        image = Image.open(io.BytesIO(image_bytes))
        img_array = np.array(image.convert('RGB'))
        img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        # Detect faces
        faces = face_service._model.get_faces(img_array)

        if not faces:
            logger.warning("[Selfie] No face detected in selfie")
            # Save search record with no_match status
            db = get_supabase_client().client
            db.table("selfie_searches").insert({
                "user_id": user_id,
                "image_url": image_url,
                "status": "no_match",
                "matches_count": 0
            }).execute()

            return ApiResponse.ok({
                "matches": [],
                "collision": None,
                "no_face_detected": True,
                "message": "Лицо не обнаружено на фото. Попробуйте другое фото."
            }).model_dump()

        if len(faces) > 1:
            logger.warning(f"[Selfie] Multiple faces ({len(faces)}) detected, using largest")

        # Use the face with highest detection score
        best_face = max(faces, key=lambda f: f.det_score)
        descriptor = best_face.embedding

        # Get threshold
        threshold = await get_confidence_threshold()
        logger.info(f"[Selfie] Using threshold {threshold}")

        # Check for collisions first
        collision = await check_collisions(descriptor, threshold)

        # Search unknown faces
        matches = await search_unknown_faces(descriptor, threshold, limit=50)

        # Get image info for top matches
        db = get_supabase_client().client
        top_matches = []

        for match in matches[:3]:
            photo_result = db.table("gallery_images").select(
                "id, image_url, original_filename"
            ).eq("id", match["photo_id"]).single().execute()

            if photo_result.data:
                top_matches.append({
                    "photo_face_id": match["photo_face_id"],
                    "photo_id": match["photo_id"],
                    "image_url": photo_result.data.get("image_url"),
                    "filename": photo_result.data.get("original_filename"),
                    "similarity": round(match["similarity"], 3)
                })

        # Determine status
        if collision:
            status = "collision"
        elif len(matches) > 0:
            status = "pending"  # Waiting for user confirmation
        else:
            status = "no_match"

        # Save search record
        search_record = db.table("selfie_searches").insert({
            "user_id": user_id,
            "image_url": image_url,
            "descriptor": descriptor.tolist(),
            "status": status,
            "matches_count": len(matches)
        }).execute()

        selfie_search_id = search_record.data[0]["id"] if search_record.data else None

        logger.info(f"[Selfie] Search complete: {len(matches)} matches, collision={collision is not None}")

        return ApiResponse.ok({
            "selfie_search_id": selfie_search_id,
            "matches": top_matches,
            "total_matches": len(matches),
            "collision": collision,
            "threshold": threshold
        }).model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Selfie] Search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/confirm-selfie")
async def confirm_selfie(
    data: ConfirmSelfieRequest,
    user_id: str = Query(..., description="User ID")
) -> dict:
    """
    Confirm selfie matches and create person.

    1. Creates new person
    2. Links user to person
    3. Marks confirmed photo_faces as verified
    4. Searches for remaining matches
    5. Assigns all matches to person (unverified)
    """
    logger.info(f"[Selfie] Confirm request from user {user_id}, faces={data.photo_face_ids}")

    db = get_supabase_client().client

    try:
        # Get selfie search record
        search_result = db.table("selfie_searches").select(
            "id, descriptor, status"
        ).eq("id", data.selfie_search_id).single().execute()

        if not search_result.data:
            raise HTTPException(status_code=404, detail="Selfie search not found")

        search = search_result.data
        if search["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Invalid status: {search['status']}")

        descriptor = search.get("descriptor")
        if not descriptor:
            raise HTTPException(status_code=400, detail="No descriptor found")

        # Get user info
        user_result = db.table("users").select(
            "id, first_name, last_name, username"
        ).eq("id", user_id).single().execute()

        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = user_result.data

        # Create person
        real_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        if not real_name:
            real_name = user.get("username") or "Unknown"

        person_result = db.table("people").insert({
            "real_name": real_name,
            "created_at": datetime.utcnow().isoformat()
        }).execute()

        if not person_result.data:
            raise HTTPException(status_code=500, detail="Failed to create person")

        person_id = person_result.data[0]["id"]
        logger.info(f"[Selfie] Created person {person_id} for user {user_id}")

        # Link user to person
        db.table("users").update({
            "person_id": person_id
        }).eq("id", user_id).execute()

        # Mark confirmed faces as verified
        for photo_face_id in data.photo_face_ids:
            db.table("photo_faces").update({
                "person_id": person_id,
                "verified": True,
                "recognition_confidence": 1.0
            }).eq("id", photo_face_id).execute()

        verified_count = len(data.photo_face_ids)
        logger.info(f"[Selfie] Verified {verified_count} faces")

        # Search for remaining matches
        threshold = await get_confidence_threshold()
        descriptor_arr = np.array(descriptor, dtype=np.float32)

        remaining_matches = await search_unknown_faces(descriptor_arr, threshold, limit=1000)

        # Filter out already confirmed faces
        confirmed_set = set(data.photo_face_ids)
        remaining_matches = [m for m in remaining_matches if m["photo_face_id"] not in confirmed_set]

        # Assign remaining matches (unverified)
        found_count = 0
        for match in remaining_matches:
            db.table("photo_faces").update({
                "person_id": person_id,
                "verified": False,
                "recognition_confidence": match["similarity"]
            }).eq("id", match["photo_face_id"]).execute()
            found_count += 1

        logger.info(f"[Selfie] Assigned {found_count} additional faces (unverified)")

        # Update selfie search status
        db.table("selfie_searches").update({
            "status": "matched",
            "matched_person_id": person_id,
            "matches_count": verified_count + found_count
        }).eq("id", data.selfie_search_id).execute()

        # Rebuild index to include new faces
        try:
            face_service = get_face_service()
            await face_service.rebuild_players_index()
            logger.info("[Selfie] Index rebuilt")
        except Exception as e:
            logger.warning(f"[Selfie] Failed to rebuild index: {e}")

        return ApiResponse.ok({
            "person_id": person_id,
            "verified_count": verified_count,
            "found_count": found_count,
            "total_photos": verified_count + found_count
        }).model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Selfie] Confirm error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
