"""
People API - Outlier Operations
Endpoints for outlier management: clear outliers, mass audit
"""

import numpy as np
import json

from fastapi import APIRouter, Query
from uuid import UUID

from core.responses import ApiResponse
from core.exceptions import NotFoundError, DatabaseError
from core.logging import get_logger

from .helpers import get_supabase_db, get_face_service

logger = get_logger(__name__)
router = APIRouter()


def _get_person_id_from_uuid(supabase_db, person_uuid: UUID) -> str:
    """Get person ID from UUID. Raises NotFoundError if not found."""
    result = supabase_db.client.table("people").select("id").eq("id", str(person_uuid)).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]["id"]
    raise NotFoundError("Person", str(person_uuid))


@router.get("/audit-all-embeddings")
@router.post("/audit-all-embeddings")
async def audit_all_embeddings(
    outlier_threshold: float = Query(0.5, description="Similarity below this = outlier"),
    min_descriptors: int = Query(3, description="Skip people with fewer descriptors"),
    dry_run: bool = Query(False, description="If true, don't actually mark anything, just show what would be marked")
):
    """
    Audit ALL people and mark outliers as excluded_from_index = TRUE.
    
    Supports both GET (for browser testing) and POST.
    Use dry_run=true to preview without making changes.
    
    This is the mass audit function that:
    1. For each person with >= min_descriptors
    2. Calculates centroid from non-excluded embeddings
    3. Marks embeddings with similarity < threshold as excluded
    4. Rebuilds HNSW index at the end (unless dry_run)
    
    Returns summary of changes per person.
    """
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    try:
        logger.info(f"[audit-all] Starting mass audit, threshold={outlier_threshold}, min_descriptors={min_descriptors}, dry_run={dry_run}")
        
        # Get all people
        people_result = supabase_db.client.table("people").select(
            "id, real_name, telegram_name"
        ).execute()
        
        people = people_result.data or []
        logger.info(f"[audit-all] Processing {len(people)} people")
        
        # Load ALL photo_faces with embeddings
        all_faces = []
        offset = 0
        page_size = 1000
        while True:
            faces_result = supabase_db.client.table("photo_faces").select(
                "id, person_id, insightface_descriptor, excluded_from_index"
            ).not_.is_("person_id", "null").not_.is_("insightface_descriptor", "null").range(
                offset, offset + page_size - 1
            ).execute()
            
            batch = faces_result.data or []
            all_faces.extend(batch)
            
            if len(batch) < page_size:
                break
            offset += page_size
        
        logger.info(f"[audit-all] Loaded {len(all_faces)} faces")
        
        # Group by person
        faces_by_person = {}
        for face in all_faces:
            pid = face.get("person_id")
            if pid:
                if pid not in faces_by_person:
                    faces_by_person[pid] = []
                faces_by_person[pid].append(face)
        
        # Process each person
        audit_results = []
        total_newly_excluded = 0
        all_outlier_face_ids = []  # Track all outlier face_ids for index removal

        for person in people:
            person_id = person["id"]
            person_name = person.get("real_name") or person.get("telegram_name") or "Unknown"
            person_faces = faces_by_person.get(person_id, [])

            if len(person_faces) < min_descriptors:
                continue

            # Parse embeddings
            embeddings_data = []  # [(embedding, face, is_excluded)]
            for face in person_faces:
                descriptor = face.get("insightface_descriptor")
                try:
                    if isinstance(descriptor, list):
                        emb = np.array(descriptor, dtype=np.float32)
                    elif isinstance(descriptor, str):
                        emb = np.array(json.loads(descriptor), dtype=np.float32)
                    else:
                        continue

                    if len(emb) == 512:
                        embeddings_data.append((emb, face, face.get("excluded_from_index", False)))
                except Exception:
                    continue

            # Get non-excluded embeddings for centroid
            non_excluded = [(e, f) for e, f, ex in embeddings_data if not ex]

            if len(non_excluded) < 2:
                continue  # Can't calculate centroid

            # Calculate centroid
            embeddings_array = np.array([e for e, f in non_excluded])
            centroid = np.mean(embeddings_array, axis=0)
            centroid = centroid / np.linalg.norm(centroid)

            # Find new outliers (not already excluded)
            new_outlier_ids = []
            for emb, face, is_excluded in embeddings_data:
                if is_excluded:
                    continue  # Already excluded

                emb_norm = emb / np.linalg.norm(emb)
                similarity = float(np.dot(emb_norm, centroid))

                if similarity < outlier_threshold:
                    new_outlier_ids.append(face["id"])

            # Mark new outliers as excluded (unless dry_run)
            if new_outlier_ids:
                if not dry_run:
                    updated = supabase_db.set_excluded_from_index(new_outlier_ids, excluded=True)
                    total_newly_excluded += updated
                    all_outlier_face_ids.extend(new_outlier_ids)
                else:
                    total_newly_excluded += len(new_outlier_ids)

                # Count total excluded for this person
                total_excluded = sum(1 for _, _, ex in embeddings_data if ex) + len(new_outlier_ids)

                audit_results.append({
                    "person_id": person_id,
                    "person_name": person_name,
                    "newly_excluded": len(new_outlier_ids),
                    "total_excluded": total_excluded,
                    "total_descriptors": len(embeddings_data)
                })

        # Remove excluded faces from index (unless dry_run)
        index_rebuilt = False
        if not dry_run and all_outlier_face_ids and face_service:
            result = await face_service.remove_faces_from_index(all_outlier_face_ids)
            index_rebuilt = result.get("deleted", 0) > 0
            logger.info(f"[audit-all] Removed {result.get('deleted', 0)} outliers from index")
        
        logger.info(f"[audit-all] Done. {len(audit_results)} people affected, {total_newly_excluded} newly excluded, dry_run={dry_run}")
        
        return ApiResponse.ok({
            "people_processed": len(people),
            "people_affected": len(audit_results),
            "total_newly_excluded": total_newly_excluded,
            "index_rebuilt": index_rebuilt,
            "dry_run": dry_run,
            "results": audit_results
        })
        
    except Exception as e:
        logger.error(f"[audit-all] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="audit_all_embeddings")


@router.post("/{identifier:uuid}/clear-outliers")
async def clear_person_outliers(
    identifier: UUID,
    outlier_threshold: float = Query(0.5, description="Similarity below this = outlier")
):
    """
    Mark outlier embeddings for a person as excluded_from_index = TRUE.
    
    Does NOT delete the descriptor, just excludes from HNSW index.
    """
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    try:
        person_id = _get_person_id_from_uuid(supabase_db, identifier)
        
        logger.info(f"[clear-outliers] Marking outliers for person {person_id}, threshold={outlier_threshold}")
        
        # Get all faces with embeddings for this person
        result = supabase_db.client.table("photo_faces").select(
            "id, insightface_descriptor, excluded_from_index"
        ).eq("person_id", person_id).not_.is_("insightface_descriptor", "null").execute()
        
        faces = result.data or []
        
        if len(faces) < 2:
            return ApiResponse.ok({
                "cleared_count": 0,
                "message": "Need at least 2 embeddings to find outliers"
            })
        
        # Parse embeddings
        embeddings_data = []  # [(embedding, face)]
        for face in faces:
            descriptor = face["insightface_descriptor"]
            try:
                if isinstance(descriptor, list):
                    emb = np.array(descriptor, dtype=np.float32)
                elif isinstance(descriptor, str):
                    emb = np.array(json.loads(descriptor), dtype=np.float32)
                else:
                    continue
                
                if len(emb) == 512:
                    embeddings_data.append((emb, face))
            except Exception:
                continue
        
        if len(embeddings_data) < 2:
            return ApiResponse.ok({
                "cleared_count": 0,
                "message": "Not enough valid embeddings"
            })
        
        # Get non-excluded for centroid
        non_excluded = [(e, f) for e, f in embeddings_data if not f.get("excluded_from_index")]
        
        if len(non_excluded) < 2:
            return ApiResponse.ok({
                "cleared_count": 0,
                "message": "Not enough non-excluded embeddings for centroid"
            })
        
        # Calculate centroid from non-excluded
        embeddings_array = np.array([e for e, f in non_excluded])
        centroid = np.mean(embeddings_array, axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        
        # Find outliers (among non-excluded)
        outlier_face_ids = []
        for emb, face in non_excluded:
            emb_norm = emb / np.linalg.norm(emb)
            similarity = float(np.dot(emb_norm, centroid))
            
            if similarity < outlier_threshold:
                outlier_face_ids.append(face["id"])
        
        if not outlier_face_ids:
            return ApiResponse.ok({
                "cleared_count": 0,
                "message": "No outliers found"
            })
        
        # Mark as excluded (not delete!)
        updated = supabase_db.set_excluded_from_index(outlier_face_ids, excluded=True)

        # Remove from index
        index_rebuilt = False
        if face_service and outlier_face_ids:
            result = await face_service.remove_faces_from_index(outlier_face_ids)
            index_rebuilt = result.get("deleted", 0) > 0
            logger.info(f"[clear-outliers] Removed {result.get('deleted', 0)} outliers from index")

        logger.info(f"[clear-outliers] Excluded {updated} outliers for person {person_id}")
        
        return ApiResponse.ok({
            "cleared_count": updated,
            "index_rebuilt": index_rebuilt
        })
        
    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"[clear-outliers] Error: {e}", exc_info=True)
        raise DatabaseError(str(e), operation="clear_person_outliers")
