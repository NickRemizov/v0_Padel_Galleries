"""
Faces API - Batch Operations
Batch operations: batch-verify, batch-assign

v5.0: Cleaned up - removed unused batch-save endpoint
v6.0: all-faces-indexed architecture
      - Faces are already in index when created
      - Use update_face_metadata instead of add/remove for person_id changes
      - Only mark_deleted when faces are actually deleted from DB
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
    Batch assign multiple faces to a person.

    v6.0: Faces are already in index (all faces indexed), use update_face_metadata.
    """
    try:
        logger.info(f"[batch-assign] START: {len(request.face_ids)} faces -> person {request.person_id}")

        if not request.face_ids:
            return ApiResponse.ok({
                "updated_count": 0,
                "metadata_updated": 0
            })

        updated_count = 0
        metadata_updated = 0

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

                        # v6.0: Update index metadata (face already in index (all faces indexed))
                        if has_descriptor:
                            try:
                                await face_service.update_face_metadata(
                                    face_id,
                                    person_id=request.person_id,
                                    verified=True,
                                    confidence=1.0,
                                    excluded=False
                                )
                                metadata_updated += 1
                            except Exception as idx_err:
                                logger.warning(f"[batch-assign] Failed to update metadata for {face_id}: {idx_err}")

            except Exception as e:
                logger.warning(f"[batch-assign] Failed to update face {face_id}: {e}")

        logger.info(f"[batch-assign] Updated {updated_count}/{len(request.face_ids)} faces, {metadata_updated} metadata")

        return ApiResponse.ok({
            "updated_count": updated_count,
            "total_requested": len(request.face_ids),
            "person_id": request.person_id,
            "metadata_updated": metadata_updated
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
    v6.0: All faces indexed - use update_face_metadata for person_id changes, mark_deleted only for DB deletes.
    """
    try:
        logger.info(f"[batch-verify] START photo={request.photo_id}, faces={len(request.kept_faces)}")

        for i, face in enumerate(request.kept_faces):
            logger.info(f"[batch-verify] Input face[{i}]: id={face.id}, person_id={face.person_id}")

        existing_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, insightface_descriptor, excluded_from_index"
        ).eq("photo_id", request.photo_id).execute()

        existing_faces = existing_response.data or []
        existing_ids = [f["id"] for f in existing_faces]
        kept_ids = [f.id for f in request.kept_faces if f.id]

        logger.info(f"[batch-verify] Existing IDs in DB: {existing_ids}")
        logger.info(f"[batch-verify] Kept IDs from request: {kept_ids}")

        # v6.0: Track faces to delete from index (only those being deleted from DB)
        deleted_face_ids = []
        to_delete = [fid for fid in existing_ids if fid not in kept_ids]

        for face_id in to_delete:
            face_data = next((f for f in existing_faces if f["id"] == face_id), None)
            if face_data and face_data.get("insightface_descriptor"):
                deleted_face_ids.append(face_id)
                logger.info(f"[batch-verify] Deleting face {face_id} (will remove from index)")
            supabase_db.client.table("photo_faces").delete().eq("id", face_id).execute()

        if to_delete:
            logger.info(f"[batch-verify] Deleted {len(to_delete)} faces, {len(deleted_face_ids)} had descriptors")

        updated_count = 0
        failed_count = 0
        metadata_updated = 0

        for face in request.kept_faces:
            if not face.id:
                continue

            current_face = next((f for f in existing_faces if f["id"] == face.id), None)
            current_person_id = current_face.get("person_id") if current_face else None
            current_excluded = current_face.get("excluded_from_index", False) if current_face else False
            has_descriptor = current_face.get("insightface_descriptor") is not None if current_face else False

            person_id_changed = face.person_id != current_person_id

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

                # v6.1: Always update index metadata (not just when person_id changes)
                # This ensures verified/confidence are synced even for verification without reassignment
                # v6.1.2: Preserve excluded status unless person_id changed (P1 fix)
                if has_descriptor:
                    try:
                        # Use empty string to signal "set to None" for person_id
                        # excluded: only reset to False when person_id changes (matches DB update logic)
                        new_excluded = False if person_id_changed else current_excluded
                        await face_service.update_face_metadata(
                            face.id,
                            person_id=face.person_id if face.person_id else "",
                            verified=bool(face.person_id),
                            confidence=1.0 if face.person_id else 0.0,
                            excluded=new_excluded
                        )
                        metadata_updated += 1
                        if person_id_changed:
                            logger.info(f"[batch-verify] Updated metadata for {face.id}: person_id={face.person_id}")
                    except Exception as idx_err:
                        logger.warning(f"[batch-verify] Failed to update metadata for {face.id}: {idx_err}")
            else:
                failed_count += 1
                logger.error(f"[batch-verify] Face {face.id} update FAILED - no data returned")

        logger.info(f"[batch-verify] Update summary: {updated_count} succeeded, {failed_count} failed, {metadata_updated} metadata updated")

        # v6.0: Only mark_deleted for faces actually deleted from DB
        if deleted_face_ids:
            try:
                result = await face_service.remove_faces_from_index(deleted_face_ids)
                logger.info(f"[batch-verify] Removed {result.get('deleted', 0)} deleted faces from index")
            except Exception as index_error:
                logger.error(f"[batch-verify] Index remove exception: {index_error}")

        result = {
            "verified": all(f.person_id for f in request.kept_faces) if request.kept_faces else False,
            "updated_count": updated_count,
            "failed_count": failed_count,
            "deleted_count": len(to_delete),
            "metadata_updated": metadata_updated
        }

        logger.info(f"[batch-verify] END result={result}")

        return ApiResponse.ok(result)

    except Exception as e:
        logger.error(f"[batch-verify] ERROR: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="batch_verify_faces")
