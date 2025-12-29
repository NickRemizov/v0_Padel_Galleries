"""
Admin Debug - Recognition Operations

Endpoints:
- GET /debug-recognition - Debug HNSW recognition for a face
"""

import json
from fastapi import APIRouter, Query
import numpy as np

from core.responses import ApiResponse
from core.logging import get_logger

from ..helpers import get_supabase_db, get_face_service

logger = get_logger(__name__)
router = APIRouter()


@router.get("/debug-recognition")
async def debug_recognition(
    face_id: str = Query(..., description="Face ID to test recognition for"),
    k: int = Query(50, description="Number of candidates to return")
):
    """
    Debug recognition: load embedding by face_id, query HNSW, show ALL candidates.
    
    Shows:
    - All k candidates returned by HNSW
    - Their similarity, source_confidence, verified status
    - Calculated final_confidence for each
    - Which one wins and why
    """
    supabase_db = get_supabase_db()
    face_service = get_face_service()
    
    if not supabase_db or not face_service:
        return ApiResponse.fail("Service not initialized", code="SERVICE_ERROR").model_dump()
    
    try:
        client = supabase_db.client
        index = face_service._players_index
        
        if not index.is_loaded():
            return ApiResponse.fail("Index not loaded", code="INDEX_ERROR").model_dump()
        
        # Load face from DB
        face_result = client.table("photo_faces").select(
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
            "candidates": candidates[:30],
            "hint": "Look at candidates to see if verified embeddings have lower similarity than non-verified"
        }).model_dump()
        
    except Exception as e:
        logger.error(f"Error in debug-recognition: {e}", exc_info=True)
        return ApiResponse.fail(f"Debug failed: {str(e)}", code="DEBUG_ERROR").model_dump()
