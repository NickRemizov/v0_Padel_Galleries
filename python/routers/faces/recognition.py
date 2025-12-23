"""
Faces API - Recognition Operations
Recognition endpoints: recognize-unknown, clear-descriptor, set-excluded
Helper functions: parse_descriptor, get_all_unknown_faces_paginated
"""

from fastapi import APIRouter, Depends, Query
from typing import List, Optional
import numpy as np
import json

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger
from services.face_recognition import FaceRecognitionService
from services.supabase_database import SupabaseDatabase

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
    Same method as supabase_database.py for consistency.
    
    Args:
        descriptor: Can be list, string (JSON), or None
        
    Returns:
        numpy array of float32 or None if invalid
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
        
        # Validate dimension
        if len(embedding) != 512:
            logger.warning(f"[parse_descriptor] Invalid dimension: {len(embedding)}, expected 512")
            return None
        
        return embedding
        
    except Exception as e:
        logger.warning(f"[parse_descriptor] Failed to parse: {e}")
        return None


async def get_all_unknown_faces_paginated(
    supabase_db: SupabaseDatabase,
    gallery_id: Optional[str] = None
) -> List[dict]:
    """
    Get ALL unknown faces with pagination (Supabase limit is 1000).
    
    Args:
        supabase_db: Database client
        gallery_id: Optional gallery filter
        
    Returns:
        List of all unknown faces with descriptors
    """
    all_faces = []
    page_size = 1000
    offset = 0
    
    while True:
        if gallery_id:
            # With gallery filter - need join
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
            # All faces - no join needed
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
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """
    Recognize all unknown faces by running them through the recognition algorithm.
    
    v4.3: Added pagination to handle >1000 faces (Supabase limit)
    
    This is useful after manually assigning a few photos to a new player -
    the algorithm can then find other photos of the same player automatically.
    
    Returns statistics by person: how many faces were recognized for each person.
    """
    try:
        logger.info(f"[recognize-unknown] START gallery_id={request.gallery_id}, threshold={request.confidence_threshold}")
        
        # IMPORTANT: Rebuild index FIRST to ensure we have latest data
        logger.info("[recognize-unknown] Rebuilding index before recognition to ensure fresh data...")
        try:
            rebuild_result = await face_service.rebuild_players_index()
            if rebuild_result.get("success"):
                logger.info(f"[recognize-unknown] ✓ Pre-recognition index rebuild: {rebuild_result.get('new_descriptor_count')} descriptors")
            else:
                logger.warning(f"[recognize-unknown] Pre-recognition index rebuild failed: {rebuild_result}")
        except Exception as e:
            logger.warning(f"[recognize-unknown] Pre-recognition index rebuild error: {e}")
        
        # Get ALL unknown faces with pagination
        unknown_faces = await get_all_unknown_faces_paginated(supabase_db, request.gallery_id)
        
        logger.info(f"[recognize-unknown] Total unknown faces with descriptors: {len(unknown_faces)}")
        
        if not unknown_faces:
            return ApiResponse.ok({
                "total_unknown": 0,
                "recognized_count": 0,
                "by_person": [],
                "index_rebuilt": True
            })
        
        # Get threshold from config if not provided
        threshold = request.confidence_threshold
        if threshold is None:
            config = supabase_db.get_recognition_config_sync()
            threshold = config.get('confidence_thresholds', {}).get('high_data', 0.60)
        
        logger.info(f"[recognize-unknown] Using threshold: {threshold}")
        
        # Process each face
        recognized_count = 0
        skipped_count = 0
        by_person = {}  # person_id -> {name, count}
        
        for i, face in enumerate(unknown_faces):
            face_id = face["id"]
            descriptor = face.get("insightface_descriptor")
            
            # Parse descriptor using same method as supabase_database.py
            embedding = parse_descriptor(descriptor)
            
            if embedding is None:
                skipped_count += 1
                continue
            
            # Run recognition
            person_id, confidence = await face_service.recognize_face(embedding, threshold)
            
            if person_id and confidence:
                # Update face in database
                supabase_db.client.table("photo_faces").update({
                    "person_id": person_id,
                    "recognition_confidence": confidence,
                    "verified": False  # Auto-recognized, not manually verified
                }).eq("id", face_id).execute()
                
                recognized_count += 1
                
                # Track by person
                if person_id not in by_person:
                    # Get person name
                    person_result = supabase_db.client.table("people").select(
                        "real_name, telegram_name"
                    ).eq("id", person_id).execute()
                    
                    person_name = "Unknown"
                    if person_result.data:
                        p = person_result.data[0]
                        person_name = p.get("real_name") or p.get("telegram_name") or "Unknown"
                    
                    by_person[person_id] = {"name": person_name, "count": 0}
                
                by_person[person_id]["count"] += 1
                
                if recognized_count <= 10 or recognized_count % 50 == 0:
                    logger.info(f"[recognize-unknown] ✓ Face {face_id[:8]}... -> {by_person[person_id]['name']} ({confidence:.3f})")
            
            # Progress log every 100 faces
            if (i + 1) % 100 == 0:
                logger.info(f"[recognize-unknown] Progress: {i + 1}/{len(unknown_faces)} processed, {recognized_count} recognized")
        
        if skipped_count > 0:
            logger.warning(f"[recognize-unknown] Skipped {skipped_count} faces with invalid descriptors")
        
        # Rebuild index AGAIN if any faces were recognized (they now have person_id)
        index_rebuilt = True  # We already rebuilt at the start
        if recognized_count > 0:
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    logger.info(f"[recognize-unknown] ✓ Post-recognition index rebuild: {rebuild_result.get('new_descriptor_count')} descriptors")
            except Exception as index_error:
                logger.error(f"[recognize-unknown] Error in post-recognition rebuild: {index_error}")
        
        # Format by_person for response
        by_person_list = [
            {"person_id": pid, "name": data["name"], "count": data["count"]}
            for pid, data in sorted(by_person.items(), key=lambda x: x[1]["count"], reverse=True)
        ]
        
        logger.info(f"[recognize-unknown] END: {recognized_count}/{len(unknown_faces)} recognized, {len(by_person)} unique people")
        
        return ApiResponse.ok({
            "total_unknown": len(unknown_faces),
            "recognized_count": recognized_count,
            "by_person": by_person_list,
            "index_rebuilt": index_rebuilt
        })
        
    except Exception as e:
        logger.error(f"[recognize-unknown] ERROR: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="recognize_unknown_faces")


@router.post("/{face_id}/clear-descriptor")
async def clear_face_descriptor(
    face_id: str,
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """
    Clear the descriptor of a face (set to NULL).
    
    Use case: Remove "bad" embeddings that cause wrong recognitions,
    while keeping the face-person link intact.
    
    The face will remain linked to the person, but won't be used
    for recognition (won't be in the HNSW index).
    """
    try:
        logger.info(f"[clear-descriptor] Clearing descriptor for face {face_id}")
        
        # Check if face exists and has descriptor
        check_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, insightface_descriptor"
        ).eq("id", face_id).execute()
        
        if not check_response.data:
            raise NotFoundError("Face", face_id)
        
        face_data = check_response.data[0]
        had_descriptor = face_data.get("insightface_descriptor") is not None
        
        if not had_descriptor:
            logger.info(f"[clear-descriptor] Face {face_id} already has no descriptor")
            return ApiResponse.ok({
                "cleared": False,
                "message": "Face already has no descriptor",
                "index_rebuilt": False
            })
        
        # Clear the descriptor
        supabase_db.client.table("photo_faces").update({
            "insightface_descriptor": None
        }).eq("id", face_id).execute()
        
        logger.info(f"[clear-descriptor] Descriptor cleared for face {face_id}")
        
        # Rebuild index to remove this face
        index_rebuilt = False
        try:
            rebuild_result = await face_service.rebuild_players_index()
            if rebuild_result.get("success"):
                index_rebuilt = True
                logger.info(f"[clear-descriptor] Index rebuilt: {rebuild_result.get('new_descriptor_count')} descriptors")
        except Exception as index_error:
            logger.error(f"[clear-descriptor] Error rebuilding index: {index_error}")
        
        return ApiResponse.ok({
            "cleared": True,
            "face_id": face_id,
            "person_id": face_data.get("person_id"),
            "index_rebuilt": index_rebuilt
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
    supabase_db: SupabaseDatabase = Depends(get_supabase_db)
):
    """
    Set excluded_from_index flag for a face.
    
    When excluded=True, the face won't be used in HNSW index for recognition,
    but the descriptor is preserved (unlike clear-descriptor which deletes it).
    
    Use case: Exclude outlier embeddings without losing the data.
    """
    try:
        logger.info(f"[set-excluded] Setting excluded_from_index={excluded} for face {face_id}")
        
        # Check if face exists
        check_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, excluded_from_index"
        ).eq("id", face_id).execute()
        
        if not check_response.data:
            raise NotFoundError("Face", face_id)
        
        face_data = check_response.data[0]
        current_excluded = face_data.get("excluded_from_index", False)
        
        if current_excluded == excluded:
            logger.info(f"[set-excluded] Face {face_id} already has excluded_from_index={excluded}")
            return ApiResponse.ok({
                "updated": False,
                "message": f"Face already has excluded_from_index={excluded}",
                "index_rebuilt": False
            })
        
        # Update the flag
        supabase_db.client.table("photo_faces").update({
            "excluded_from_index": excluded
        }).eq("id", face_id).execute()
        
        logger.info(f"[set-excluded] Updated face {face_id}: excluded_from_index={excluded}")
        
        # Rebuild index
        index_rebuilt = False
        try:
            rebuild_result = await face_service.rebuild_players_index()
            if rebuild_result.get("success"):
                index_rebuilt = True
                logger.info(f"[set-excluded] Index rebuilt: {rebuild_result.get('new_descriptor_count')} descriptors")
        except Exception as index_error:
            logger.error(f"[set-excluded] Error rebuilding index: {index_error}")
        
        return ApiResponse.ok({
            "updated": True,
            "face_id": face_id,
            "excluded_from_index": excluded,
            "index_rebuilt": index_rebuilt
        })
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"[set-excluded] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="set_face_excluded")
