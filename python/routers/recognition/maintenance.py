"""
Maintenance endpoints for face recognition system.
- POST /rebuild-index
"""

from fastapi import APIRouter, HTTPException, Depends
import logging

from .dependencies import face_service_instance

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/rebuild-index")
async def rebuild_index(
    face_service=Depends(lambda: face_service_instance)
):
    """
    Rebuild the HNSWLIB index from database.
    Call this after adding new face descriptors to make them available for recognition.
    """
    try:
        logger.info(f"[v3.31] ===== REBUILD INDEX REQUEST =====")
        
        result = await face_service.rebuild_players_index()
        
        if result["success"]:
            logger.info(f"[v3.31] ✓ Index rebuilt successfully")
            logger.info(f"[v3.31]   Old count: {result['old_descriptor_count']}")
            logger.info(f"[v3.31]   New count: {result['new_descriptor_count']}")
            logger.info(f"[v3.31]   Unique people: {result['unique_people_count']}")
        else:
            logger.error(f"[v3.31] ✗ Index rebuild failed: {result.get('error')}")
        
        logger.info(f"[v3.31] ===== END REBUILD INDEX =====")
        
        return result
        
    except Exception as e:
        logger.error(f"[v3.31] ERROR rebuilding index: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
