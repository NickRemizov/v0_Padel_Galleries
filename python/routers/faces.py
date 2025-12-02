from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from services.face_recognition import FaceRecognitionService
from services.supabase_database import SupabaseDatabase
import logging
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

router = APIRouter()

# supabase_db = SupabaseDatabase()

face_service_instance = None
supabase_db_instance = None

def set_services(face_service: FaceRecognitionService, supabase_db: SupabaseDatabase):
    global face_service_instance, supabase_db_instance
    face_service_instance = face_service
    supabase_db_instance = supabase_db


class SaveFaceRequest(BaseModel):
    photo_id: str
    person_id: Optional[str]
    bounding_box: Optional[dict]  # {x, y, width, height}
    embedding: List[float]
    confidence: Optional[float]
    recognition_confidence: Optional[float]
    verified: bool


class SaveFaceResponse(BaseModel):
    success: bool
    data: Optional[dict]
    error: Optional[str]
    index_updated: bool


class UpdateFaceRequest(BaseModel):
    face_id: str
    person_id: Optional[str]
    verified: Optional[bool]
    recognition_confidence: Optional[float]


class DeleteFaceRequest(BaseModel):
    face_id: str


@router.post("/save", response_model=SaveFaceResponse)
async def save_face(
    request: SaveFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Save a face with descriptor to database and automatically update recognition index.
    This is the single source of truth for face data - all face saves must go through here.
    """
    try:
        logger.info("=" * 80)
        logger.info("[Faces API] ===== SAVE FACE REQUEST START =====")
        logger.info(f"[Faces API] Photo ID: {request.photo_id}")
        logger.info(f"[Faces API] Person ID: {request.person_id}")
        logger.info(f"[Faces API] Verified: {request.verified}")
        logger.info(f"[Faces API] Embedding length: {len(request.embedding)}")
        
        # Build insert data
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
            logger.info("[Faces API] Verified face - setting recognition_confidence to 1.0")
        elif request.recognition_confidence is not None:
            insert_data["recognition_confidence"] = request.recognition_confidence
        
        if request.embedding and len(request.embedding) > 0:
            vector_string = f"[{','.join(map(str, request.embedding))}]"
            insert_data["insightface_descriptor"] = vector_string
            logger.info(f"[Faces API] Adding descriptor (dimension: {len(request.embedding)})")
            logger.info(f"[Faces API] Embedding sample (first 5): {request.embedding[:5]}")
            logger.info(f"[Faces API] Embedding sample (last 5): {request.embedding[-5:]}")
        
        logger.info(f"[Faces API] Insert data keys: {list(insert_data.keys())}")
        logger.info(f"[Faces API] Verified={insert_data.get('verified')}, Person ID={insert_data.get('person_id')}, Has descriptor={('insightface_descriptor' in insert_data)}")
        
        logger.info("[Faces API] Saving to Supabase...")
        response = supabase_db.client.table("photo_faces").insert(insert_data).execute()
        
        if not response.data:
            logger.error("[Faces API] Failed to save face")
            return SaveFaceResponse(
                success=False,
                data=None,
                error="Failed to save face to database",
                index_updated=False
            )
        
        saved_face = response.data[0]
        saved_id = saved_face.get('id')
        logger.info(f"[Faces API] ✓ Face saved with ID: {saved_id}")
        logger.info(f"[Faces API] Saved face verification status: verified={saved_face.get('verified')}, person_id={saved_face.get('person_id')}")
        
        # Verify the record was saved
        verify_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, verified, insightface_descriptor"
        ).eq("id", saved_id).execute()
        
        if verify_response.data:
            verified_record = verify_response.data[0]
            has_descriptor = verified_record.get('insightface_descriptor') is not None
            logger.info(f"[Faces API] ✓ Verified record exists: id={saved_id}, person_id={verified_record.get('person_id')}, verified={verified_record.get('verified')}, has_descriptor={has_descriptor}")
            
            if has_descriptor:
                descriptor = verified_record.get('insightface_descriptor')
                if isinstance(descriptor, str):
                    import json
                    descriptor_array = json.loads(descriptor)
                    logger.info(f"[Faces API] Descriptor from DB length: {len(descriptor_array)}")
                elif isinstance(descriptor, list):
                    logger.info(f"[Faces API] Descriptor from DB length: {len(descriptor)}")
        else:
            logger.error(f"[Faces API] ⚠️ Could not verify record {saved_id} was saved!")
        
        index_updated = False
        if request.verified and request.person_id and request.embedding and len(request.embedding) > 0:
            logger.info("[Faces API] Verified face detected - rebuilding recognition index...")
            logger.info(f"[Faces API] About to rebuild index for person_id={request.person_id}")
            logger.info(f"[Faces API] Newly saved face ID: {saved_id}")
            
            try:
                old_count = len(face_service.player_ids_map) if face_service.player_ids_map else 0
                logger.info(f"[Faces API] Current index size before rebuild: {old_count}")
                
                rebuild_result = await face_service.rebuild_players_index()
                
                if rebuild_result.get("success"):
                    index_updated = True
                    new_count = rebuild_result.get('new_descriptor_count', 0)
                    people_count = rebuild_result.get('unique_people_count', 0)
                    
                    logger.info(f"[Faces API] ✓ Index rebuilt: {old_count} -> {new_count} descriptors for {people_count} people")
                    
                    expected_count = old_count + 1
                    if new_count == old_count:
                        logger.error(f"[Faces API] ❌ CRITICAL: Descriptor count DID NOT INCREASE!")
                        logger.error(f"[Faces API] Expected: {expected_count}, Got: {new_count}")
                        logger.error(f"[Faces API] Saved face ID: {saved_id}")
                        logger.error(f"[Faces API] Person ID: {request.person_id}")
                        logger.error(f"[Faces API] This indicates the record was NOT loaded by get_all_player_embeddings()")
                    elif new_count == expected_count:
                        logger.info(f"[Faces API] ✓ Descriptor count increased correctly: {old_count} -> {new_count}")
                    else:
                        logger.warning(f"[Faces API] ⚠️ Unexpected descriptor count change: expected {expected_count}, got {new_count}")
                        logger.warning(f"[Faces API] This may happen if other records were added/removed concurrently")
                else:
                    logger.error(f"[Faces API] Index rebuild failed: {rebuild_result.get('error')}")
            except Exception as index_error:
                logger.error(f"[Faces API] Error rebuilding index: {str(index_error)}", exc_info=True)
        else:
            logger.info(f"[Faces API] Not rebuilding index - verified={request.verified}, person_id={request.person_id}, has_embedding={len(request.embedding) > 0 if request.embedding else False}")
        
        logger.info("[Faces API] ===== SAVE FACE REQUEST END =====")
        logger.info("=" * 80)
        
        return SaveFaceResponse(
            success=True,
            data=saved_face,
            error=None,
            index_updated=index_updated
        )
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[Faces API] ❌ ERROR in save_face")
        logger.error(f"[Faces API] Error type: {type(e).__name__}")
        logger.error(f"[Faces API] Error message: {str(e)}")
        logger.error(f"[Faces API] Traceback:", exc_info=True)
        logger.error("=" * 80)
        
        return SaveFaceResponse(
            success=False,
            data=None,
            error=str(e),
            index_updated=False
        )


@router.post("/update")
async def update_face(
    request: UpdateFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """Update an existing face record"""
    try:
        logger.info(f"[Faces API] Updating face {request.face_id}")
        
        update_data = {}
        if request.person_id is not None:
            update_data["person_id"] = request.person_id
        if request.verified is not None:
            update_data["verified"] = request.verified
        if request.recognition_confidence is not None:
            update_data["recognition_confidence"] = request.recognition_confidence
        
        response = supabase_db.client.table("photo_faces").update(
            update_data
        ).eq("id", request.face_id).execute()
        
        if not response.data:
            return {"success": False, "error": "Face not found"}
        
        logger.info(f"[Faces API] ✓ Face updated: {request.face_id}")
        
        return {"success": True, "data": response.data[0]}
        
    except Exception as e:
        logger.error(f"[Faces API] Error updating face: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/delete")
async def delete_face(
    request: DeleteFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance)
):
    """Delete a face record"""
    try:
        logger.info(f"[Faces API] Deleting face {request.face_id}")
        
        response = supabase_db_instance.client.table("photo_faces").delete().eq(
            "id", request.face_id
        ).execute()
        
        logger.info(f"[Faces API] ✓ Face deleted: {request.face_id}")
        
        # Rebuild index after deletion
        await face_service.rebuild_players_index()
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"[Faces API] Error deleting face: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}
