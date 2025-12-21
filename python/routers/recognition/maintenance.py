"""
Maintenance endpoints for face recognition system.
- POST /rebuild-index
"""

from fastapi import APIRouter, Depends

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
