"""
Maintenance endpoints for face recognition system.
- POST /rebuild-index
- GET /index-status
- GET /index-debug-person
- GET /debug-recognition
"""

from fastapi import APIRouter, Depends, Query
import numpy as np
import json

from core.config import VERSION
from core.responses import ApiResponse
from core.exceptions import IndexRebuildError
from core.logging import get_logger
from .dependencies import get_face_service

logger = get_logger(__name__)
router = APIRouter()


@router.post("/rebuild-index")
async def rebuild_index(
    face_service=Depends(get_face_service)
):
    """
    Rebuild the HNSWLIB index from database.
    Call this after adding new face descriptors to make them available for recognition.
    """
    try:
        logger.info(f"[v{VERSION}] ===== REBUILD INDEX REQUEST =====")
        
        result = await face_service.rebuild_players_index()
        
        if result["success"]:
            logger.info(f"[v{VERSION}] ✓ Index rebuilt successfully")
            logger.info(f"[v{VERSION}]   Old count: {result['old_descriptor_count']}")
            logger.info(f"[v{VERSION}]   New count: {result['new_descriptor_count']}")
            logger.info(f"[v{VERSION}]   Unique people: {result['unique_people_count']}")
            logger.info(f"[v{VERSION}] ===== END REBUILD INDEX =====")
            
            return ApiResponse.ok({
                "old_descriptor_count": result["old_descriptor_count"],
                "new_descriptor_count": result["new_descriptor_count"],
                "unique_people_count": result["unique_people_count"]
            }).model_dump()
        else:
            logger.error(f"[v{VERSION}] ✗ Index rebuild failed: {result.get('error')}")
            logger.info(f"[v{VERSION}] ===== END REBUILD INDEX =====")
            raise IndexRebuildError(result.get("error", "Unknown error"))
        
    except IndexRebuildError:
        raise
    except Exception as e:
        logger.error(f"[v{VERSION}] ERROR rebuilding index: {str(e)}")
        raise IndexRebuildError(f"Failed to rebuild index: {str(e)}")


@router.get("/index-status")
async def get_index_status(
    face_service=Depends(get_face_service)
):
    """
    Get current index status - what's in memory right now.
    """
    try:
        index = face_service._players_index

        if not index.is_loaded():
            return ApiResponse.ok({
                "loaded": False,
                "message": "Index not loaded"
            }).model_dump()

        # Get excluded count from database
        excluded_count = 0
        try:
            db = face_service.supabase_db
            result = db.client.table("photo_faces").select(
                "id", count="exact"
            ).eq("excluded_from_index", True).execute()
            excluded_count = result.count or 0
        except Exception as e:
            logger.warning(f"Could not get excluded count: {e}")

        # Format last rebuild time
        last_rebuild = None
        if index.last_rebuild_time:
            last_rebuild = index.last_rebuild_time.isoformat()

        return ApiResponse.ok({
            "loaded": True,
            "total_embeddings": index.get_count(),
            "unique_people": index.get_unique_people_count(),
            "verified_count": index.get_verified_count(),
            "excluded_count": excluded_count,
            "deleted_in_index": index.deleted_count,
            "capacity": index.max_elements,
            "last_rebuild_time": last_rebuild
        }).model_dump()

    except Exception as e:
        logger.error(f"Error getting index status: {e}")
        return ApiResponse.fail(str(e), code="INDEX_ERROR").model_dump()


@router.get("/index-debug-person")
async def get_index_debug_person(
    person_id: str = Query(..., description="Person ID to debug"),
    face_service=Depends(get_face_service)
):
    """
    Show what's ACTUALLY in memory for a specific person.
    This is the raw data from confidence_map, verified_map, ids_map.
    """
    try:
        index = face_service._players_index
        
        if not index.is_loaded():
            return ApiResponse.ok({
                "loaded": False,
                "message": "Index not loaded"
            }).model_dump()
        
        # Find all entries for this person_id in the index
        entries = []
        for i, pid in enumerate(index.ids_map):
            if pid == person_id:
                entries.append({
                    "index_position": i,
                    "person_id": pid,
                    "verified": index.verified_map[i],
                    "source_confidence": index.confidence_map[i]
                })
        
        # Analyze
        conf_values = [e["source_confidence"] for e in entries]
        verified_count = sum(1 for e in entries if e["verified"])
        
        summary = {
            "total_entries": len(entries),
            "verified_entries": verified_count,
            "non_verified_entries": len(entries) - verified_count,
            "min_confidence": min(conf_values) if conf_values else None,
            "max_confidence": max(conf_values) if conf_values else None,
            "conf_100_count": sum(1 for c in conf_values if c >= 0.9999),
            "conf_below_100_count": sum(1 for c in conf_values if c < 0.9999)
        }
        
        # Show first 20 entries with details
        return ApiResponse.ok({
            "person_id": person_id,
            "summary": summary,
            "entries": entries[:20],
            "hint": "These are ACTUAL values in memory, not from DB"
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error debugging person in index: {e}")
        return ApiResponse.fail(str(e), code="INDEX_ERROR").model_dump()


@router.get("/debug-recognition")
async def debug_recognition(
    face_id: str = Query(..., description="Face ID to test recognition for"),
    k: int = Query(50, description="Number of candidates to return"),
    face_service=Depends(get_face_service)
):
    """
    Debug recognition: load embedding by face_id, query HNSW, show ALL candidates.
    
    Shows:
    - All k candidates returned by HNSW
    - Their similarity, source_confidence, verified status
    - Calculated final_confidence for each
    - Which one wins and why
    """
    try:
        index = face_service._players_index
        
        if not index.is_loaded():
            return ApiResponse.fail("Index not loaded", code="INDEX_ERROR").model_dump()
        
        # Use face_service.supabase_db - the correct client
        db = face_service.supabase_db
        
        # Load face from DB
        face_result = db.client.table("photo_faces").select(
            "id, person_id, insightface_descriptor, verified, recognition_confidence, people(real_name)"
        ).eq("id", face_id).execute()
        
        if not face_result.data:
            return ApiResponse.fail(f"Face {face_id} not found", code="NOT_FOUND").model_dump()
        
        face = face_result.data[0]
        descriptor = face.get("insightface_descriptor")
        
        if not descriptor:
            return ApiResponse.fail(f"Face {face_id} has no descriptor", code="NO_DESCRIPTOR").model_dump()
        
        # Parse embedding
        if isinstance(descriptor, str):
            embedding = np.array(json.loads(descriptor), dtype=np.float32)
        elif isinstance(descriptor, list):
            embedding = np.array(descriptor, dtype=np.float32)
        else:
            return ApiResponse.fail(f"Unknown descriptor type: {type(descriptor)}", code="INVALID_DESCRIPTOR").model_dump()
        
        k = min(k, index.get_count())
        
        # Query HNSW
        person_ids, similarities, verified_flags, source_confidences = index.query(embedding, k=k)
        
        # Build detailed candidate list
        candidates = []
        best_person_id = None
        best_final_confidence = 0.0
        best_iteration = 0
        early_exit_at = None
        
        for i in range(len(person_ids)):
            person_id = person_ids[i]
            similarity = similarities[i]
            source_conf = source_confidences[i]
            is_verified = verified_flags[i]
            
            # Check early exit condition
            if similarity < best_final_confidence and early_exit_at is None:
                early_exit_at = i + 1
            
            # Calculate final
            final_confidence = source_conf * similarity
            
            # Track winner
            is_new_best = False
            if final_confidence > best_final_confidence:
                best_final_confidence = final_confidence
                best_person_id = person_id
                best_iteration = i + 1
                is_new_best = True
            
            candidates.append({
                "iteration": i + 1,
                "person_id": person_id,
                "similarity": round(similarity, 6),
                "source_confidence": round(source_conf, 6),
                "verified": is_verified,
                "final_confidence": round(final_confidence, 6),
                "is_new_best": is_new_best,
                "would_early_exit": early_exit_at is not None and i + 1 >= early_exit_at
            })
        
        # Group by person_id for analysis
        person_summary = {}
        for c in candidates:
            pid = c["person_id"]
            if pid not in person_summary:
                person_summary[pid] = {
                    "count": 0,
                    "best_final": 0,
                    "best_similarity": 0,
                    "has_verified": False
                }
            person_summary[pid]["count"] += 1
            if c["final_confidence"] > person_summary[pid]["best_final"]:
                person_summary[pid]["best_final"] = c["final_confidence"]
            if c["similarity"] > person_summary[pid]["best_similarity"]:
                person_summary[pid]["best_similarity"] = c["similarity"]
            if c["verified"]:
                person_summary[pid]["has_verified"] = True
        
        return ApiResponse.ok({
            "face_info": {
                "face_id": face_id,
                "current_person_id": face.get("person_id"),
                "current_person_name": face.get("people", {}).get("real_name") if face.get("people") else None,
                "db_verified": face.get("verified"),
                "db_recognition_confidence": face.get("recognition_confidence")
            },
            "query_k": k,
            "total_candidates": len(candidates),
            "winner": {
                "person_id": best_person_id,
                "final_confidence": round(best_final_confidence, 6),
                "won_at_iteration": best_iteration
            },
            "early_exit_at": early_exit_at,
            "person_summary": person_summary,
            "candidates": candidates[:30],  # Show first 30
            "hint": "Look at candidates to see if verified embeddings have lower similarity than non-verified"
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in debug recognition: {e}", exc_info=True)
        return ApiResponse.fail(str(e), code="DEBUG_ERROR").model_dump()
