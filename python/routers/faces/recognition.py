"""
Faces API - Recognition Operations
Recognition endpoints: recognize-unknown, clear-descriptor, set-excluded
Helper functions: parse_descriptor, get_all_unknown_faces_paginated

v4.4: Migrated to SupabaseService
"""

from fastapi import APIRouter, Depends, Query
from typing import List, Optional
import numpy as np
import json

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger
from services.face_recognition import FaceRecognitionService
from services.supabase import SupabaseService

from .models import RecognizeUnknownRequest

logger = get_logger(__name__)
router = APIRouter()


def get_face_service():
    from . import face_service_instance
    return face_service_instance


def get_supabase_db():
    from . import supabase_db_instance
    return supabase_db_instance


def parse_descriptor(descriptor) -> Optional[np.ndarray]:
    """
    Parse descriptor from database to numpy array.
    """
    if descriptor is None:
        return None
    
    try:
        if isinstance(descriptor, list):
            embedding = np.array(descriptor, dtype=np.float32)
        elif isinstance(descriptor, str):
            embedding = np.array(json.loads(descriptor), dtype=np.float32)
        else:
            logger.warning(f"[parse_descriptor] Unknown type: {type(descriptor)}")
            return None
        
        if len(embedding) != 512:
            logger.warning(f"[parse_descriptor] Invalid dimension: {len(embedding)}, expected 512")
            return None
        
        return embedding
        
    except Exception as e:
        logger.warning(f"[parse_descriptor] Failed to parse: {e}")
        return None


async def get_all_unknown_faces_paginated(
    supabase_db: SupabaseService,
    gallery_id: Optional[str] = None
) -> List[dict]:
    """
    Get ALL unknown faces with pagination (Supabase limit is 1000).
    """
    all_faces = []
    page_size = 1000
    offset = 0
    
    while True:
        if gallery_id:
            response = supabase_db.client.table("photo_faces").select(
                "id, photo_id, insightface_descriptor, gallery_images!inner(gallery_id)"
            ).is_(
                "person_id", "null"
            ).not_.is_(
                "insightface_descriptor", "null"
            ).eq(
                "gallery_images.gallery_id", gallery_id
            ).order("created_at", desc=False).range(offset, offset + page_size - 1).execute()
        else:
            response = supabase_db.client.table("photo_faces").select(
                "id, photo_id, insightface_descriptor"
            ).is_(
                "person_id", "null"
            ).not_.is_(
                "insightface_descriptor", "null"
            ).order("created_at", desc=False).range(offset, offset + page_size - 1).execute()
        
        if not response.data or len(response.data) == 0:
            break
        
        all_faces.extend(response.data)
        logger.info(f"[recognize-unknown] Loaded page: offset={offset}, count={len(response.data)}, total={len(all_faces)}")
        
        if len(response.data) < page_size:
            break
        
        offset += page_size
    
    return all_faces


@router.post("/recognize-unknown")
async def recognize_unknown_faces(
    request: RecognizeUnknownRequest,
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """
    Recognize all unknown faces by running them through the recognition algorithm.
    Performs full index rebuild before recognition for consistency and speed.
    """
    try:
        logger.info(f"[recognize-unknown] START gallery_id={request.gallery_id}, threshold={request.confidence_threshold}")

        unknown_faces = await get_all_unknown_faces_paginated(supabase_db, request.gallery_id)

        logger.info(f"[recognize-unknown] Total unknown faces with descriptors: {len(unknown_faces)}")

        if not unknown_faces:
            return ApiResponse.ok({
                "total_unknown": 0,
                "recognized_count": 0,
                "by_person": [],
                "index_rebuilt": True
            })

        # v5.1: Rebuild index before batch recognition for consistency
        logger.info(f"[recognize-unknown] Rebuilding index before processing {len(unknown_faces)} faces...")
        await face_service.rebuild_players_index()
        logger.info(f"[recognize-unknown] Index rebuilt, starting recognition")

        threshold = request.confidence_threshold
        if threshold is None:
            config = supabase_db.get_recognition_config()
            threshold = config.get('confidence_thresholds', {}).get('high_data', 0.60)

        logger.info(f"[recognize-unknown] Using threshold: {threshold}")
        
        recognized_count = 0
        skipped_count = 0
        by_person = {}
        recognized_face_ids = []  # Track face_ids for index update

        for i, face in enumerate(unknown_faces):
            face_id = face["id"]
            descriptor = face.get("insightface_descriptor")

            embedding = parse_descriptor(descriptor)

            if embedding is None:
                skipped_count += 1
                continue

            person_id, confidence = await face_service.recognize_face(embedding, threshold)

            if person_id and confidence:
                supabase_db.client.table("photo_faces").update({
                    "person_id": person_id,
                    "recognition_confidence": confidence,
                    "verified": False
                }).eq("id", face_id).execute()

                # v6.1: Update index metadata (face already in index (all faces indexed))
                try:
                    await face_service.update_face_metadata(
                        face_id,
                        person_id=person_id,
                        confidence=confidence,
                        verified=False
                    )
                except Exception as idx_err:
                    logger.warning(f"[recognize-unknown] Failed to update metadata for {face_id[:8]}: {idx_err}")

                recognized_count += 1
                recognized_face_ids.append(face_id)

                if person_id not in by_person:
                    person_result = supabase_db.client.table("people").select(
                        "real_name, telegram_full_name"
                    ).eq("id", person_id).execute()

                    person_name = "Unknown"
                    if person_result.data:
                        p = person_result.data[0]
                        person_name = p.get("real_name") or p.get("telegram_full_name") or "Unknown"

                    by_person[person_id] = {"name": person_name, "count": 0}

                by_person[person_id]["count"] += 1

                if recognized_count <= 10 or recognized_count % 50 == 0:
                    logger.info(f"[recognize-unknown] Face {face_id[:8]}... -> {by_person[person_id]['name']} ({confidence:.3f})")

            if (i + 1) % 100 == 0:
                logger.info(f"[recognize-unknown] Progress: {i + 1}/{len(unknown_faces)} processed, {recognized_count} recognized")

        if skipped_count > 0:
            logger.warning(f"[recognize-unknown] Skipped {skipped_count} faces with invalid descriptors")

        # v6.1: Metadata already updated in loop above (faces already indexed)
        
        by_person_list = [
            {"person_id": pid, "name": data["name"], "count": data["count"]}
            for pid, data in sorted(by_person.items(), key=lambda x: x[1]["count"], reverse=True)
        ]
        
        logger.info(f"[recognize-unknown] END: {recognized_count}/{len(unknown_faces)} recognized, {len(by_person)} unique people")
        
        return ApiResponse.ok({
            "total_unknown": len(unknown_faces),
            "recognized_count": recognized_count,
            "by_person": by_person_list,
            "metadata_updated": recognized_count  # v6.1: count of faces with updated metadata
        })
        
    except Exception as e:
        logger.error(f"[recognize-unknown] ERROR: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="recognize_unknown_faces")


@router.post("/{face_id}/clear-descriptor")
async def clear_face_descriptor(
    face_id: str,
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """
    Clear the descriptor of a face (set to NULL).
    """
    try:
        logger.info(f"[clear-descriptor] Clearing descriptor for face {face_id}")
        
        check_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, insightface_descriptor"
        ).eq("id", face_id).execute()
        
        if not check_response.data:
            raise NotFoundError("Face", face_id)
        
        face_data = check_response.data[0]
        had_descriptor = face_data.get("insightface_descriptor") is not None
        had_person_id = face_data.get("person_id") is not None

        if not had_descriptor:
            logger.info(f"[clear-descriptor] Face {face_id} already has no descriptor")
            return ApiResponse.ok({
                "cleared": False,
                "message": "Face already has no descriptor",
                "index_rebuilt": False
            })

        supabase_db.client.table("photo_faces").update({
            "insightface_descriptor": None
        }).eq("id", face_id).execute()

        logger.info(f"[clear-descriptor] Descriptor cleared for face {face_id}")

        # v6.1: Remove from index if had descriptor (all faces with descriptors are indexed)
        index_updated = False
        if had_descriptor:
            try:
                result = await face_service.remove_face_from_index(face_id)
                if result.get("success"):
                    index_updated = True
                    logger.info(f"[clear-descriptor] Face removed from index")
            except Exception as index_error:
                logger.error(f"[clear-descriptor] Error removing from index: {index_error}")
        
        return ApiResponse.ok({
            "cleared": True,
            "face_id": face_id,
            "person_id": face_data.get("person_id"),
            "index_updated": index_updated
        })
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"[clear-descriptor] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="clear_face_descriptor")


@router.post("/{face_id}/set-excluded")
async def set_face_excluded(
    face_id: str,
    excluded: bool = Query(True, description="Set to True to exclude from index, False to include"),
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """
    Exclude face from index or delete unrecognized face.

    For faces WITH person_id: sets excluded_from_index flag and removes from HNSW index.
    For faces WITHOUT person_id (unrecognized): DELETES the photo_face record entirely.
    """
    try:
        logger.info(f"[set-excluded] Processing face {face_id}, excluded={excluded}")

        check_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, excluded_from_index"
        ).eq("id", face_id).execute()

        if not check_response.data:
            raise NotFoundError("Face", face_id)

        face_data = check_response.data[0]
        person_id = face_data.get("person_id")

        # For unrecognized faces (no person_id) - DELETE the record entirely
        if not person_id and excluded:
            logger.info(f"[set-excluded] Deleting unrecognized face {face_id}")

            # v6.1: Remove from index BEFORE deleting from DB (all faces are indexed)
            try:
                await face_service.remove_face_from_index(face_id)
                logger.info(f"[set-excluded] Removed face {face_id} from index")
            except Exception as idx_err:
                logger.warning(f"[set-excluded] Failed to remove from index: {idx_err}")

            supabase_db.client.table("photo_faces").delete().eq("id", face_id).execute()
            return ApiResponse.ok({
                "updated": True,
                "deleted": True,
                "face_id": face_id,
                "message": "Unrecognized face deleted"
            })

        # For recognized faces - set excluded flag and update index
        current_excluded = face_data.get("excluded_from_index", False)

        if current_excluded == excluded:
            logger.info(f"[set-excluded] Face {face_id} already has excluded_from_index={excluded}")
            return ApiResponse.ok({
                "updated": False,
                "message": f"Face already has excluded_from_index={excluded}",
                "index_rebuilt": False
            })

        supabase_db.client.table("photo_faces").update({
            "excluded_from_index": excluded
        }).eq("id", face_id).execute()

        logger.info(f"[set-excluded] Updated face {face_id}: excluded_from_index={excluded}")

        # v6.1: Use update_metadata instead of remove/add (all faces stay indexed)
        metadata_updated = False
        try:
            await face_service.update_face_metadata(face_id, excluded=excluded)
            metadata_updated = True
            logger.info(f"[set-excluded] Updated metadata: excluded={excluded}")
        except Exception as index_error:
            logger.error(f"[set-excluded] Error updating metadata: {index_error}")

        return ApiResponse.ok({
            "updated": True,
            "face_id": face_id,
            "excluded_from_index": excluded,
            "metadata_updated": metadata_updated
        })
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"[set-excluded] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="set_face_excluded")
