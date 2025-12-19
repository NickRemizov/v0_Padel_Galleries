"""
Faces API Router
Face detection, recognition and management endpoints

v4.0: Fixed index rebuild on face deletion
v4.1: Added recognize-unknown endpoint
v4.2: Fixed descriptor parsing in recognize-unknown
v4.3: Added pagination to recognize-unknown (Supabase limit is 1000)
v4.4: Added clear-descriptor endpoint for outlier removal
v4.5: Added set-excluded endpoint for excluded_from_index flag
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import json

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger
from services.face_recognition import FaceRecognitionService
from services.supabase_database import SupabaseDatabase

logger = get_logger(__name__)
router = APIRouter()

face_service_instance = None
supabase_db_instance = None


def set_services(face_service: FaceRecognitionService, supabase_db: SupabaseDatabase):
    global face_service_instance, supabase_db_instance
    face_service_instance = face_service
    supabase_db_instance = supabase_db


# Request/Response Models

class SaveFaceRequest(BaseModel):
    photo_id: str
    person_id: Optional[str]
    bounding_box: Optional[dict]
    embedding: List[float]
    confidence: Optional[float]
    recognition_confidence: Optional[float]
    verified: bool


class UpdateFaceRequest(BaseModel):
    face_id: str
    person_id: Optional[str]
    verified: Optional[bool]
    recognition_confidence: Optional[float]


class DeleteFaceRequest(BaseModel):
    face_id: str


class BatchSaveFaceRequest(BaseModel):
    photo_id: str
    faces: List[SaveFaceRequest]


class BatchPhotoIdsRequest(BaseModel):
    photo_ids: List[str]


class KeptFace(BaseModel):
    id: str
    person_id: Optional[str]


class BatchVerifyRequest(BaseModel):
    photo_id: str
    kept_faces: List[KeptFace]


class RecognizeUnknownRequest(BaseModel):
    gallery_id: Optional[str] = None
    confidence_threshold: Optional[float] = None


# Endpoints

@router.post("/batch")
async def get_batch_photo_faces(
    request: BatchPhotoIdsRequest,
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """Get all faces for multiple photos in a single request."""
    try:
        logger.info(f"Getting faces for {len(request.photo_ids)} photos")
        
        if not request.photo_ids:
            return ApiResponse.ok([])
        
        # Use SELECT * to ensure all fields are returned correctly
        # The descriptor field adds some overhead but ensures compatibility
        result = supabase_db.client.table("photo_faces") \
            .select("*, people(id, real_name, telegram_name)") \
            .in_("photo_id", request.photo_ids) \
            .execute()
        
        logger.info(f"Found {len(result.data or [])} faces")
        return ApiResponse.ok(result.data or [])
        
    except Exception as e:
        logger.error(f"Error getting batch faces: {e}")
        raise DatabaseError(str(e), operation="get_batch_photo_faces")


@router.get("/photo/{photo_id}")
async def get_photo_faces(
    photo_id: str,
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """Get all faces for a single photo."""
    try:
        logger.info(f"Getting faces for photo: {photo_id}")
        
        result = supabase_db.client.table("photo_faces") \
            .select("*, people(id, real_name, telegram_name)") \
            .eq("photo_id", photo_id) \
            .execute()
        
        logger.info(f"Found {len(result.data or [])} faces for photo {photo_id}")
        return ApiResponse.ok(result.data or [])
        
    except Exception as e:
        logger.error(f"Error getting photo faces: {e}")
        raise DatabaseError(str(e), operation="get_photo_faces")


@router.post("/save")
async def save_face(
    request: SaveFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """Save a face with descriptor to database and update recognition index."""
    try:
        logger.info(f"Saving face for photo {request.photo_id}, person {request.person_id}")
        
        insert_data = {
            "photo_id": request.photo_id,
            "person_id": request.person_id,
            "verified": request.verified,
        }
        
        if request.bounding_box:
            insert_data["insightface_bbox"] = request.bounding_box
        
        if request.confidence is not None:
            insert_data["confidence"] = request.confidence
        
        if request.verified and request.person_id:
            insert_data["recognition_confidence"] = 1.0
        elif request.recognition_confidence is not None:
            insert_data["recognition_confidence"] = request.recognition_confidence
        
        if request.embedding and len(request.embedding) > 0:
            vector_string = f"[{','.join(map(str, request.embedding))}]"
            insert_data["insightface_descriptor"] = vector_string
        
        response = supabase_db.client.table("photo_faces").insert(insert_data).execute()
        
        if not response.data:
            raise DatabaseError("Failed to save face", operation="save_face")
        
        saved_face = response.data[0]
        logger.info(f"Face saved with ID: {saved_face.get('id')}")
        
        index_updated = False
        if request.verified and request.person_id and request.embedding and len(request.embedding) > 0:
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_updated = True
                    logger.info("Index rebuilt successfully")
            except Exception as index_error:
                logger.error(f"Error rebuilding index: {index_error}")
        
        return ApiResponse.ok({
            "face": saved_face,
            "index_updated": index_updated
        })
        
    except DatabaseError:
        raise
    except Exception as e:
        logger.error(f"Error saving face: {e}")
        raise DatabaseError(str(e), operation="save_face")


@router.post("/update")
async def update_face(
    request: UpdateFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """Update an existing face record."""
    try:
        logger.info(f"Updating face {request.face_id}")
        
        update_data = {}
        if request.person_id is not None:
            update_data["person_id"] = request.person_id
        if request.verified is not None:
            update_data["verified"] = request.verified
        if request.recognition_confidence is not None:
            update_data["recognition_confidence"] = request.recognition_confidence
        
        response = supabase_db.client.table("photo_faces").update(
            update_data
        ).eq("id", request.face_id).execute()
        
        if not response.data:
            raise NotFoundError("Face", request.face_id)
        
        logger.info(f"Face updated: {request.face_id}")
        return ApiResponse.ok(response.data[0])
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating face: {e}")
        raise DatabaseError(str(e), operation="update_face")


@router.post("/delete")
async def delete_face(
    request: DeleteFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """Delete a face record and rebuild recognition index if needed."""
    try:
        logger.info(f"[v4.0] Deleting face {request.face_id}")
        
        check_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, verified, insightface_descriptor"
        ).eq("id", request.face_id).execute()
        
        if not check_response.data:
            raise NotFoundError("Face", request.face_id)
        
        face_data = check_response.data[0]
        had_descriptor = face_data.get('insightface_descriptor') is not None
        had_person_id = face_data.get('person_id') is not None
        
        logger.info(f"[v4.0] Face has descriptor: {had_descriptor}, person_id: {had_person_id}")
        
        supabase_db.client.table("photo_faces").delete().eq("id", request.face_id).execute()
        logger.info(f"[v4.0] Face deleted from DB: {request.face_id}")
        
        # Rebuild index if face had descriptor (was in index)
        index_updated = False
        if had_descriptor:
            try:
                logger.info("[v4.0] Rebuilding index after face deletion...")
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_updated = True
                    logger.info(f"[v4.0] ✓ Index rebuilt: {rebuild_result.get('new_descriptor_count')} descriptors")
                else:
                    logger.error(f"[v4.0] ✗ Index rebuild failed: {rebuild_result}")
            except Exception as index_error:
                logger.error(f"[v4.0] Error rebuilding index: {index_error}")
        
        return ApiResponse.ok({"deleted": True, "index_updated": index_updated})
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting face: {e}")
        raise DatabaseError(str(e), operation="delete_face")


@router.post("/batch-save")
async def batch_save_faces(
    request: BatchSaveFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """Save multiple faces and rebuild index once."""
    try:
        logger.info(f"Batch saving {len(request.faces)} faces for photo {request.photo_id}")
        
        # Delete existing tags for this photo
        supabase_db.client.table("photo_faces").delete().eq("photo_id", request.photo_id).execute()
        
        saved_faces = []
        has_verified_faces = False
        
        for face in request.faces:
            insert_data = {
                "photo_id": request.photo_id,
                "person_id": face.person_id,
                "verified": face.verified,
            }
            
            if face.bounding_box:
                insert_data["insightface_bbox"] = face.bounding_box
            
            if face.confidence is not None:
                insert_data["confidence"] = face.confidence
            
            if face.verified and face.person_id:
                insert_data["recognition_confidence"] = 1.0
                has_verified_faces = True
            elif face.recognition_confidence is not None:
                insert_data["recognition_confidence"] = face.recognition_confidence
            
            if face.embedding and len(face.embedding) > 0:
                vector_string = f"[{','.join(map(str, face.embedding))}]"
                insert_data["insightface_descriptor"] = vector_string
            
            response = supabase_db.client.table("photo_faces").insert(insert_data).execute()
            if response.data:
                saved_faces.append(response.data[0])
        
        logger.info(f"Saved {len(saved_faces)} faces")
        
        index_updated = False
        if has_verified_faces:
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_updated = True
                    logger.info("Index rebuilt successfully")
            except Exception as index_error:
                logger.error(f"Error rebuilding index: {index_error}")
        
        return ApiResponse.ok({
            "faces": saved_faces,
            "saved_count": len(saved_faces),
            "index_updated": index_updated
        })
        
    except Exception as e:
        logger.error(f"Error in batch save: {e}")
        raise DatabaseError(str(e), operation="batch_save_faces")


@router.post("/batch-verify")
async def batch_verify_faces(
    request: BatchVerifyRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Batch verify faces: update kept faces and delete removed ones.
    
    v4.0: Always rebuild index if faces were deleted OR updated with person_id
    """
    try:
        logger.info(f"[batch-verify] START photo={request.photo_id}, faces={len(request.kept_faces)}")
        
        # Log input faces
        for i, face in enumerate(request.kept_faces):
            logger.info(f"[batch-verify] Input face[{i}]: id={face.id}, person_id={face.person_id}")
        
        # Get existing faces with their descriptors
        existing_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, insightface_descriptor"
        ).eq("photo_id", request.photo_id).execute()
        
        existing_faces = existing_response.data or []
        existing_ids = [f["id"] for f in existing_faces]
        kept_ids = [f.id for f in request.kept_faces if f.id]
        
        logger.info(f"[batch-verify] Existing IDs in DB: {existing_ids}")
        logger.info(f"[batch-verify] Kept IDs from request: {kept_ids}")
        
        # Check if any deleted faces had descriptors (were in index)
        deleted_faces_had_descriptors = False
        to_delete = [fid for fid in existing_ids if fid not in kept_ids]
        
        for face_id in to_delete:
            face_data = next((f for f in existing_faces if f["id"] == face_id), None)
            if face_data and face_data.get("insightface_descriptor"):
                deleted_faces_had_descriptors = True
                logger.info(f"[batch-verify] Deleting face {face_id} (had descriptor)")
            supabase_db.client.table("photo_faces").delete().eq("id", face_id).execute()
        
        if to_delete:
            logger.info(f"[batch-verify] Deleted {len(to_delete)} faces, had_descriptors={deleted_faces_had_descriptors}")
        
        # Update kept faces
        updated_count = 0
        failed_count = 0
        any_has_person_id = False
        
        for face in request.kept_faces:
            if not face.id:
                continue
                
            if face.person_id:
                any_has_person_id = True
            
            update_data = {
                "person_id": face.person_id,
                "recognition_confidence": 1.0 if face.person_id else None,
                "verified": bool(face.person_id),
            }
            
            logger.info(f"[batch-verify] Updating face {face.id} with: {update_data}")
            
            response = supabase_db.client.table("photo_faces").update(update_data).eq("id", face.id).execute()
            
            if response.data:
                updated_count += 1
                logger.info(f"[batch-verify] ✓ Face {face.id} updated: verified={update_data['verified']}, confidence={update_data['recognition_confidence']}, person_id={face.person_id}")
            else:
                failed_count += 1
                logger.error(f"[batch-verify] ✗ Face {face.id} update FAILED - no data returned")
        
        logger.info(f"[batch-verify] Update summary: {updated_count} succeeded, {failed_count} failed")
        
        # Rebuild index if:
        # 1. Any deleted faces had descriptors (need to remove from index)
        # 2. Any kept faces have person_id (need to update in index)
        need_rebuild = deleted_faces_had_descriptors or any_has_person_id
        
        index_rebuilt = False
        if need_rebuild:
            faces_with_person = [f for f in request.kept_faces if f.person_id]
            logger.info(f"[batch-verify] Rebuilding index: deleted_had_descriptors={deleted_faces_had_descriptors}, faces_with_person={len(faces_with_person)}")
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_rebuilt = True
                    logger.info(f"[batch-verify] ✓ Index rebuilt: {rebuild_result}")
                else:
                    logger.error(f"[batch-verify] ✗ Index rebuild failed: {rebuild_result}")
            except Exception as index_error:
                logger.error(f"[batch-verify] ✗ Index rebuild exception: {index_error}")
        else:
            logger.info("[batch-verify] No index rebuild needed")
        
        result = {
            "verified": all(f.person_id for f in request.kept_faces) if request.kept_faces else False,
            "index_rebuilt": index_rebuilt,
            "updated_count": updated_count,
            "failed_count": failed_count,
            "deleted_count": len(to_delete)
        }
        
        logger.info(f"[batch-verify] END result={result}")
        
        return ApiResponse.ok(result)
        
    except Exception as e:
        logger.error(f"[batch-verify] ERROR: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="batch_verify_faces")


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
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
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
        
        # Get ALL unknown faces with pagination
        unknown_faces = await get_all_unknown_faces_paginated(supabase_db, request.gallery_id)
        
        logger.info(f"[recognize-unknown] Total unknown faces with descriptors: {len(unknown_faces)}")
        
        if not unknown_faces:
            return ApiResponse.ok({
                "total_unknown": 0,
                "recognized_count": 0,
                "by_person": []
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
        
        # Rebuild index if any faces were recognized (they now have person_id)
        index_rebuilt = False
        if recognized_count > 0:
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_rebuilt = True
                    logger.info(f"[recognize-unknown] Index rebuilt: {rebuild_result.get('new_descriptor_count')} descriptors")
            except Exception as index_error:
                logger.error(f"[recognize-unknown] Error rebuilding index: {index_error}")
        
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
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
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
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
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


@router.get("/statistics")
async def get_face_statistics(
    confidence_threshold: Optional[float] = None,
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """Get face recognition statistics for admin panel."""
    try:
        logger.info(f"Getting face statistics")
        
        config = supabase_db.get_recognition_config()
        threshold = confidence_threshold or config.get('recognition_threshold', 0.60)
        
        people_response = supabase_db.client.table("people").select("id", count="exact").execute()
        people_data = people_response.data or []
        total_people = people_response.count or 0
        
        faces_response = supabase_db.client.table("photo_faces").select(
            "id, photo_id, person_id, verified, confidence"
        ).execute()
        
        faces = faces_response.data or []
        
        verified_count = len([f for f in faces if f.get("verified")])
        high_conf_count = len([
            f for f in faces 
            if f.get("confidence", 0) >= threshold and not f.get("verified")
        ])
        
        faces_by_person = {}
        for face in faces:
            person_id = face.get("person_id")
            if person_id:
                if person_id not in faces_by_person:
                    faces_by_person[person_id] = []
                faces_by_person[person_id].append(face)
        
        people_stats = []
        for person in people_data:
            person_id = person["id"]
            person_faces = faces_by_person.get(person_id, [])
            
            verified_photo_ids = set(
                f["photo_id"] for f in person_faces if f.get("verified")
            )
            high_conf_photo_ids = set(
                f["photo_id"] for f in person_faces 
                if f.get("confidence", 0) >= threshold and not f.get("verified")
            )
            
            total_confirmed = len(verified_photo_ids) + len(high_conf_photo_ids)
            
            people_stats.append({
                "id": person_id,
                "verifiedPhotos": len(verified_photo_ids),
                "highConfidencePhotos": len(high_conf_photo_ids),
                "totalConfirmed": total_confirmed,
            })
        
        people_stats.sort(key=lambda x: x["totalConfirmed"], reverse=True)
        
        logger.info(f"Statistics: {total_people} people, {verified_count} verified, {high_conf_count} high-conf")
        
        return ApiResponse.ok({
            "summary": {
                "totalPeople": total_people,
                "totalVerifiedFaces": verified_count,
                "totalHighConfidenceFaces": high_conf_count,
            },
            "peopleStats": people_stats,
        })
        
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        raise DatabaseError(str(e), operation="get_face_statistics")
