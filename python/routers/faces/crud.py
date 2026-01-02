"""
Faces API - CRUD Operations
Basic face CRUD endpoints: get, save, update, delete

v4.7: Fix verified/confidence sync in update_face
v4.8: Migrated to SupabaseService
"""

from fastapi import APIRouter, Depends

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger
from services.face_recognition import FaceRecognitionService
from services.supabase import SupabaseService

from .models import (
    SaveFaceRequest,
    UpdateFaceRequest,
    DeleteFaceRequest,
    BatchPhotoIdsRequest,
)

logger = get_logger(__name__)
router = APIRouter()


def get_face_service():
    from . import face_service_instance
    return face_service_instance


def get_supabase_db():
    from . import supabase_db_instance
    return supabase_db_instance


@router.post("/batch")
async def get_batch_photo_faces(
    request: BatchPhotoIdsRequest,
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """Get all faces for multiple photos in a single request."""
    try:
        logger.info(f"Getting faces for {len(request.photo_ids)} photos")
        
        if not request.photo_ids:
            return ApiResponse.ok([])
        
        result = supabase_db.client.table("photo_faces").select("*, people(id, real_name, telegram_name)").in_("photo_id", request.photo_ids).execute()
        
        logger.info(f"Found {len(result.data or [])} faces")
        return ApiResponse.ok(result.data or [])
        
    except Exception as e:
        logger.error(f"Error getting batch faces: {e}")
        raise DatabaseError(str(e), operation="get_batch_photo_faces")


@router.get("/photo/{photo_id}")
async def get_photo_faces(
    photo_id: str,
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """Get all faces for a single photo."""
    try:
        logger.info(f"Getting faces for photo: {photo_id}")
        
        result = supabase_db.client.table("photo_faces").select("*, people(id, real_name, telegram_name)").eq("photo_id", photo_id).execute()
        
        logger.info(f"Found {len(result.data or [])} faces for photo {photo_id}")
        return ApiResponse.ok(result.data or [])
        
    except Exception as e:
        logger.error(f"Error getting photo faces: {e}")
        raise DatabaseError(str(e), operation="get_photo_faces")


@router.post("/save")
async def save_face(
    request: SaveFaceRequest,
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
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
        if request.person_id and request.embedding and len(request.embedding) > 0:
            try:
                import numpy as np
                embedding = np.array(request.embedding, dtype=np.float32)
                verified = request.verified or False
                confidence = request.recognition_confidence or (1.0 if verified else 0.0)
                result = await face_service.add_face_to_index(
                    saved_face["id"], request.person_id, embedding, verified, confidence
                )
                if result.get("success"):
                    index_updated = True
                    logger.info(f"Face added to index (rebuild_triggered: {result.get('rebuild_triggered')})")
            except Exception as index_error:
                logger.error(f"Error adding to index: {index_error}")
        
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
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """Update an existing face record."""
    try:
        logger.info(f"Updating face {request.face_id}")
        
        current_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, insightface_descriptor, excluded_from_index"
        ).eq("id", request.face_id).execute()
        
        if not current_response.data:
            raise NotFoundError("Face", request.face_id)
        
        current_face = current_response.data[0]
        current_person_id = current_face.get("person_id")
        has_descriptor = current_face.get("insightface_descriptor") is not None
        
        update_data = {}
        person_id_changed = False
        
        if request.person_id is not None:
            update_data["person_id"] = request.person_id
            if request.person_id != current_person_id:
                person_id_changed = True
                update_data["excluded_from_index"] = False
                logger.info(f"[update_face] person_id changing {current_person_id} -> {request.person_id}, resetting excluded_from_index")
                
        if request.verified is not None:
            update_data["verified"] = request.verified
            if request.verified:
                effective_person_id = request.person_id if request.person_id is not None else current_person_id
                if effective_person_id:
                    update_data["recognition_confidence"] = 1.0
                    logger.info(f"[update_face] v4.7: verified=true with person_id, setting confidence=1.0")
        
        if request.recognition_confidence is not None:
            update_data["recognition_confidence"] = request.recognition_confidence
        
        response = supabase_db.client.table("photo_faces").update(
            update_data
        ).eq("id", request.face_id).execute()
        
        if not response.data:
            raise NotFoundError("Face", request.face_id)
        
        index_rebuilt = False
        if person_id_changed and has_descriptor:
            try:
                # Remove old entry if was in index
                if current_person_id:
                    await face_service.remove_face_from_index(request.face_id)
                    logger.info(f"[update_face] Removed face from index (old person_id)")

                # Add new entry if has new person_id
                new_person_id = request.person_id
                if new_person_id:
                    result = await face_service.add_face_to_index(request.face_id, new_person_id)
                    if result.get("success"):
                        index_rebuilt = True
                        logger.info(f"[update_face] Face added to index (rebuild_triggered: {result.get('rebuild_triggered')})")
            except Exception as index_error:
                logger.error(f"[update_face] Error updating index: {index_error}")
        
        logger.info(f"Face updated: {request.face_id}, index_rebuilt={index_rebuilt}")
        
        result = response.data[0]
        result["index_rebuilt"] = index_rebuilt
        return ApiResponse.ok(result)
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error updating face: {e}")
        raise DatabaseError(str(e), operation="update_face")


@router.post("/delete")
async def delete_face(
    request: DeleteFaceRequest,
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """Delete a face record and rebuild recognition index if needed."""
    try:
        logger.info(f"Deleting face {request.face_id}")
        
        check_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, verified, insightface_descriptor"
        ).eq("id", request.face_id).execute()
        
        if not check_response.data:
            raise NotFoundError("Face", request.face_id)
        
        face_data = check_response.data[0]
        had_descriptor = face_data.get('insightface_descriptor') is not None
        had_person_id = face_data.get('person_id') is not None
        
        logger.info(f"Face has descriptor: {had_descriptor}, person_id: {had_person_id}")
        
        supabase_db.client.table("photo_faces").delete().eq("id", request.face_id).execute()
        logger.info(f"Face deleted from DB: {request.face_id}")
        
        index_updated = False
        if had_descriptor and had_person_id:
            try:
                logger.info("Removing face from index...")
                result = await face_service.remove_face_from_index(request.face_id)
                if result.get("success"):
                    index_updated = True
                    logger.info(f"Face removed from index (rebuild_triggered: {result.get('rebuild_triggered')})")
                else:
                    logger.error(f"Failed to remove from index: {result}")
            except Exception as index_error:
                logger.error(f"Error removing from index: {index_error}")
        
        return ApiResponse.ok({"deleted": True, "index_updated": index_updated})
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error deleting face: {e}")
        raise DatabaseError(str(e), operation="delete_face")
