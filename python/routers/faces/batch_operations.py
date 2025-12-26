"""
Faces API - Batch Operations
Batch operations: batch-verify, batch-assign, batch-save

v4.8: Optimized batch-verify - rebuild index only when person_id changes
v4.9: Migrated to SupabaseService
"""

from fastapi import APIRouter, Depends

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger
from services.face_recognition import FaceRecognitionService
from services.supabase import SupabaseService

from .models import (
    BatchSaveFaceRequest,
    BatchVerifyRequest,
    BatchAssignRequest,
)

logger = get_logger(__name__)
router = APIRouter()


def get_face_service():
    from . import face_service_instance
    return face_service_instance


def get_supabase_db():
    from . import supabase_db_instance
    return supabase_db_instance


@router.post("/batch-assign")
async def batch_assign_faces(
    request: BatchAssignRequest,
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """
    Batch assign multiple faces to a person with single index rebuild.
    """
    try:
        logger.info(f"[batch-assign] START: {len(request.face_ids)} faces -> person {request.person_id}")
        
        if not request.face_ids:
            return ApiResponse.ok({
                "updated_count": 0,
                "index_rebuilt": False
            })
        
        updated_count = 0
        has_descriptors = False
        
        for face_id in request.face_ids:
            try:
                check_response = supabase_db.client.table("photo_faces").select(
                    "id, insightface_descriptor"
                ).eq("id", face_id).execute()
                
                if check_response.data:
                    if check_response.data[0].get("insightface_descriptor"):
                        has_descriptors = True
                    
                    update_response = supabase_db.client.table("photo_faces").update({
                        "person_id": request.person_id,
                        "verified": True,
                        "recognition_confidence": 1.0,
                        "excluded_from_index": False
                    }).eq("id", face_id).execute()
                    
                    if update_response.data:
                        updated_count += 1
                        
            except Exception as e:
                logger.warning(f"[batch-assign] Failed to update face {face_id}: {e}")
        
        logger.info(f"[batch-assign] Updated {updated_count}/{len(request.face_ids)} faces")
        
        index_rebuilt = False
        if has_descriptors and updated_count > 0:
            try:
                logger.info("[batch-assign] Rebuilding index after batch assignment...")
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_rebuilt = True
                    logger.info(f"[batch-assign] Index rebuilt: {rebuild_result.get('new_descriptor_count')} descriptors")
                else:
                    logger.error(f"[batch-assign] Index rebuild failed: {rebuild_result}")
            except Exception as index_error:
                logger.error(f"[batch-assign] Error rebuilding index: {index_error}")
        
        return ApiResponse.ok({
            "updated_count": updated_count,
            "total_requested": len(request.face_ids),
            "person_id": request.person_id,
            "index_rebuilt": index_rebuilt
        })
        
    except Exception as e:
        logger.error(f"[batch-assign] ERROR: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="batch_assign_faces")


@router.post("/batch-save")
async def batch_save_faces(
    request: BatchSaveFaceRequest,
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """Save multiple faces and rebuild index once."""
    try:
        logger.info(f"Batch saving {len(request.faces)} faces for photo {request.photo_id}")
        
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
    face_service: FaceRecognitionService = Depends(get_face_service),
    supabase_db: SupabaseService = Depends(get_supabase_db)
):
    """
    Batch verify faces: update kept faces and delete removed ones.
    
    v4.8: Optimized - rebuild index ONLY when person_id changes or faces deleted.
    """
    try:
        logger.info(f"[batch-verify] START photo={request.photo_id}, faces={len(request.kept_faces)}")
        
        for i, face in enumerate(request.kept_faces):
            logger.info(f"[batch-verify] Input face[{i}]: id={face.id}, person_id={face.person_id}")
        
        existing_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, insightface_descriptor"
        ).eq("photo_id", request.photo_id).execute()
        
        existing_faces = existing_response.data or []
        existing_ids = [f["id"] for f in existing_faces]
        kept_ids = [f.id for f in request.kept_faces if f.id]
        
        logger.info(f"[batch-verify] Existing IDs in DB: {existing_ids}")
        logger.info(f"[batch-verify] Kept IDs from request: {kept_ids}")
        
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
        
        updated_count = 0
        failed_count = 0
        person_id_changed_with_descriptor = False
        
        for face in request.kept_faces:
            if not face.id:
                continue
            
            current_face = next((f for f in existing_faces if f["id"] == face.id), None)
            current_person_id = current_face.get("person_id") if current_face else None
            has_descriptor = current_face.get("insightface_descriptor") is not None if current_face else False
            
            if face.person_id != current_person_id and has_descriptor:
                person_id_changed_with_descriptor = True
                logger.info(f"[batch-verify] Face {face.id} person_id changed: {current_person_id} -> {face.person_id} (has descriptor)")
            
            update_data = {
                "person_id": face.person_id,
                "recognition_confidence": 1.0 if face.person_id else None,
                "verified": bool(face.person_id),
            }
            
            if face.person_id != current_person_id:
                update_data["excluded_from_index"] = False
            
            logger.info(f"[batch-verify] Updating face {face.id} with: {update_data}")
            
            response = supabase_db.client.table("photo_faces").update(update_data).eq("id", face.id).execute()
            
            if response.data:
                updated_count += 1
                logger.info(f"[batch-verify] Face {face.id} updated: verified={update_data['verified']}, confidence={update_data['recognition_confidence']}, person_id={face.person_id}")
            else:
                failed_count += 1
                logger.error(f"[batch-verify] Face {face.id} update FAILED - no data returned")
        
        logger.info(f"[batch-verify] Update summary: {updated_count} succeeded, {failed_count} failed")
        
        need_rebuild = deleted_faces_had_descriptors or person_id_changed_with_descriptor
        
        index_rebuilt = False
        if need_rebuild:
            logger.info(f"[batch-verify] Rebuilding index: deleted_had_descriptors={deleted_faces_had_descriptors}, person_id_changed={person_id_changed_with_descriptor}")
            try:
                rebuild_result = await face_service.rebuild_players_index()
                if rebuild_result.get("success"):
                    index_rebuilt = True
                    logger.info(f"[batch-verify] Index rebuilt: {rebuild_result}")
                else:
                    logger.error(f"[batch-verify] Index rebuild failed: {rebuild_result}")
            except Exception as index_error:
                logger.error(f"[batch-verify] Index rebuild exception: {index_error}")
        else:
            logger.info("[batch-verify] No index rebuild needed (no person_id changes with descriptors)")
        
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
