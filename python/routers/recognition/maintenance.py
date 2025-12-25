"""
Maintenance endpoints for face recognition system.
- POST /rebuild-index
- GET /index-status
- GET /index-debug-person
"""

from fastapi import APIRouter, Depends, Query

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
        
        # Analyze confidence distribution in memory
        conf_100 = sum(1 for c in index.confidence_map if c >= 0.9999)
        conf_80_99 = sum(1 for c in index.confidence_map if 0.80 <= c < 0.9999)
        conf_60_79 = sum(1 for c in index.confidence_map if 0.60 <= c < 0.80)
        conf_below_60 = sum(1 for c in index.confidence_map if c < 0.60)
        
        return ApiResponse.ok({
            "loaded": True,
            "total_embeddings": index.get_count(),
            "unique_people": index.get_unique_people_count(),
            "verified_count": index.get_verified_count(),
            "confidence_distribution_in_memory": {
                "100%": conf_100,
                "80-99%": conf_80_99,
                "60-79%": conf_60_79,
                "<60%": conf_below_60
            }
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
