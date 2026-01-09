"""
Faces API - Batch Operations
Batch operations: batch-verify, batch-assign

v5.0: Cleaned up - removed unused batch-save endpoint
"""

from fastapi import APIRouter, Depends

from core.responses import ApiResponse
from core.exceptions import DatabaseError
from core.logging import get_logger
from services.face_recognition import FaceRecognitionService
from services.supabase import SupabaseService

from .models import (
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
        faces_with_descriptors = []  # Track face_ids with descriptors for index

        for face_id in request.face_ids:
            try:
                check_response = supabase_db.client.table("photo_faces").select(
                    "id, insightface_descriptor"
                ).eq("id", face_id).execute()

                if check_response.data:
                    has_descriptor = check_response.data[0].get("insightface_descriptor") is not None

                    from datetime import datetime, timezone
                    update_response = supabase_db.client.table("photo_faces").update({
                        "person_id": request.person_id,
                        "verified": True,
                        "recognition_confidence": 1.0,
                        "verified_at": datetime.now(timezone.utc).isoformat(),
                        "excluded_from_index": False
                    }).eq("id", face_id).execute()

                    if update_response.data:
                        updated_count += 1
                        if has_descriptor:
                            faces_with_descriptors.append(face_id)

            except Exception as e:
                logger.warning(f"[batch-assign] Failed to update face {face_id}: {e}")

        logger.info(f"[batch-assign] Updated {updated_count}/{len(request.face_ids)} faces")

        index_rebuilt = False
        if faces_with_descriptors:
            try:
                logger.info(f"[batch-assign] Adding {len(faces_with_descriptors)} faces to index...")
                result = await face_service.add_faces_to_index(faces_with_descriptors)
                if result.get("added", 0) > 0:
                    index_rebuilt = True
                    logger.info(f"[batch-assign] Added {result.get('added')} faces (rebuild_triggered: {result.get('rebuild_triggered')})")
            except Exception as index_error:
                logger.error(f"[batch-assign] Error adding to index: {index_error}")

        return ApiResponse.ok({
            "updated_count": updated_count,
            "total_requested": len(request.face_ids),
            "person_id": request.person_id,
            "index_rebuilt": index_rebuilt
        })

    except Exception as e:
        logger.error(f"[batch-assign] ERROR: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="batch_assign_faces")


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

        deleted_face_ids_in_index = []
        to_delete = [fid for fid in existing_ids if fid not in kept_ids]

        for face_id in to_delete:
            face_data = next((f for f in existing_faces if f["id"] == face_id), None)
            if face_data and face_data.get("insightface_descriptor") and face_data.get("person_id"):
                deleted_face_ids_in_index.append(face_id)
                logger.info(f"[batch-verify] Deleting face {face_id} (was in index)")
            supabase_db.client.table("photo_faces").delete().eq("id", face_id).execute()

        if to_delete:
            logger.info(f"[batch-verify] Deleted {len(to_delete)} faces, {len(deleted_face_ids_in_index)} were in index")

        updated_count = 0
        failed_count = 0
        faces_removed_from_index = []  # old person_id was set
        faces_added_to_index = []  # new person_id is set

        for face in request.kept_faces:
            if not face.id:
                continue

            current_face = next((f for f in existing_faces if f["id"] == face.id), None)
            current_person_id = current_face.get("person_id") if current_face else None
            has_descriptor = current_face.get("insightface_descriptor") is not None if current_face else False

            person_id_changed = face.person_id != current_person_id

            # Only reindex if person_id actually changed
            # (confidence is handled by embeddings.py - verified=true gives confidence=1.0)
            if has_descriptor and face.person_id and person_id_changed:
                if current_person_id:
                    faces_removed_from_index.append(face.id)
                faces_added_to_index.append(face.id)
                logger.info(f"[batch-verify] Face {face.id} person_id changed: {current_person_id} -> {face.person_id}")

            from datetime import datetime, timezone
            update_data = {
                "person_id": face.person_id,
                "recognition_confidence": 1.0 if face.person_id else None,
                "verified": bool(face.person_id),
                "verified_at": datetime.now(timezone.utc).isoformat() if face.person_id else None,
            }

            if person_id_changed:
                update_data["excluded_from_index"] = False

            logger.info(f"[batch-verify] Updating face {face.id} with: {update_data}")

            response = supabase_db.client.table("photo_faces").update(update_data).eq("id", face.id).execute()

            if response.data:
                updated_count += 1
            else:
                failed_count += 1
                logger.error(f"[batch-verify] Face {face.id} update FAILED - no data returned")

        logger.info(f"[batch-verify] Update summary: {updated_count} succeeded, {failed_count} failed")

        # Update index incrementally
        all_removed = deleted_face_ids_in_index + faces_removed_from_index
        index_rebuilt = False

        if all_removed or faces_added_to_index:
            try:
                if all_removed:
                    result = await face_service.remove_faces_from_index(all_removed)
                    logger.info(f"[batch-verify] Removed {result.get('deleted', 0)} faces from index")

                if faces_added_to_index:
                    result = await face_service.add_faces_to_index(faces_added_to_index)
                    logger.info(f"[batch-verify] Added {result.get('added', 0)} faces to index")
                    if result.get("rebuild_triggered"):
                        index_rebuilt = True

                index_rebuilt = True
            except Exception as index_error:
                logger.error(f"[batch-verify] Index update exception: {index_error}")
        else:
            logger.info("[batch-verify] No index update needed")

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
