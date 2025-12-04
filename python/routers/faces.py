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

face_service_instance = None
supabase_db_instance = None

def set_services(face_service: FaceRecognitionService, supabase_db: SupabaseDatabase):
    global face_service_instance, supabase_db_instance
    face_service_instance = face_service
    supabase_db_instance = supabase_db


class SaveFaceRequest(BaseModel):
    photo_id: str
    person_id: Optional[str]
    bounding_box: Optional[dict]
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


class BatchSaveFaceRequest(BaseModel):
    photo_id: str
    faces: List[SaveFaceRequest]


class BatchPhotoIdsRequest(BaseModel):
    photo_ids: List[str]


class VerifyFaceRequest(BaseModel):
    photo_face_id: str
    person_id: str
    verified: bool = True


class VerifyFaceResponse(BaseModel):
    success: bool
    data: Optional[dict]
    error: Optional[str]


@router.post("/batch")
async def get_batch_photo_faces(
    request: BatchPhotoIdsRequest,
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Get all faces for multiple photos WITHOUT embeddings.
    Returns only: person_id, confidence, verified, bbox, people info
    """
    try:
        logger.info(f"[Faces API] Getting faces for {len(request.photo_ids)} photos")
        
        if not request.photo_ids:
            return {"success": True, "data": []}
        
        result = supabase_db.client.table("photo_faces") \
            .select("id, photo_id, person_id, recognition_confidence, verified, insightface_bbox, insightface_confidence, people(id, real_name, telegram_name)") \
            .in_("photo_id", request.photo_ids) \
            .execute()
        
        if not result.data:
            return {"success": True, "data": []}
        
        logger.info(f"[Faces API] Found {len(result.data)} faces")
        return {"success": True, "data": result.data}
        
    except Exception as e:
        logger.error(f"[Faces API] Error: {str(e)}")
        return {"success": False, "error": str(e), "data": []}


@router.get("/photo/{photo_id}")
async def get_photo_faces(
    photo_id: str,
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Get all faces for a single photo WITHOUT embeddings.
    Used by FaceTaggingDialog to check existing faces.
    """
    try:
        logger.info(f"[Faces API] Getting faces for photo: {photo_id}")
        
        result = supabase_db.client.table("photo_faces") \
            .select("id, photo_id, person_id, recognition_confidence, verified, insightface_bbox, insightface_confidence, people(id, real_name, telegram_name)") \
            .eq("photo_id", photo_id) \
            .execute()
        
        if not result.data:
            logger.info(f"[Faces API] No faces found")
            return {"success": True, "data": []}
        
        logger.info(f"[Faces API] Found {len(result.data)} faces")
        return {"success": True, "data": result.data}
        
    except Exception as e:
        logger.error(f"[Faces API] Error: {str(e)}")
        return {"success": False, "error": str(e), "data": []}


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
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Delete a face record and automatically rebuild recognition index.
    This is the single source of truth for face deletion - all deletions must go through here.
    """
    try:
        logger.info("=" * 80)
        logger.info("[Faces API] ===== DELETE FACE REQUEST START =====")
        logger.info(f"[Faces API] Face ID: {request.face_id}")
        
        check_response = supabase_db.client.table("photo_faces").select(
            "id, person_id, verified, insightface_descriptor"
        ).eq("id", request.face_id).execute()
        
        had_descriptor = False
        if check_response.data and len(check_response.data) > 0:
            face_data = check_response.data[0]
            had_descriptor = face_data.get('insightface_descriptor') is not None
            logger.info(f"[Faces API] Face before deletion: verified={face_data.get('verified')}, person_id={face_data.get('person_id')}, has_descriptor={had_descriptor}")
        else:
            logger.warning(f"[Faces API] Face {request.face_id} not found")
            return {"success": False, "error": "Face not found"}
        
        old_count = len(face_service.player_ids_map) if face_service.player_ids_map else 0
        logger.info(f"[Faces API] Current index size before deletion: {old_count}")
        
        response = supabase_db.client.table("photo_faces").delete().eq(
            "id", request.face_id
        ).execute()
        
        logger.info(f"[Faces API] ✓ Face deleted: {request.face_id}")
        
        index_updated = False
        if had_descriptor:
            logger.info("[Faces API] Face had descriptor - rebuilding recognition index...")
            
            try:
                rebuild_result = await face_service.rebuild_players_index()
                
                if rebuild_result.get("success"):
                    index_updated = True
                    new_count = rebuild_result.get('new_descriptor_count', 0)
                    people_count = rebuild_result.get('unique_people_count', 0)
                    
                    logger.info(f"[Faces API] ✓ Index rebuilt: {old_count} -> {new_count} descriptors for {people_count} people")
                    
                    expected_count = old_count - 1
                    if new_count == old_count:
                        logger.error(f"[Faces API] ❌ CRITICAL: Descriptor count DID NOT DECREASE!")
                        logger.error(f"[Faces API] Expected: {expected_count}, Got: {new_count}")
                    elif new_count == expected_count:
                        logger.info(f"[Faces API] ✓ Descriptor count decreased correctly: {old_count} -> {new_count}")
                    else:
                        logger.warning(f"[Faces API] ⚠️ Unexpected descriptor count change: expected {expected_count}, got {new_count}")
                else:
                    logger.error(f"[Faces API] Index rebuild failed: {rebuild_result.get('error')}")
            except Exception as index_error:
                logger.error(f"[Faces API] Error rebuilding index: {str(index_error)}", exc_info=True)
        else:
            logger.info(f"[Faces API] Face had no descriptor - skipping index rebuild")
        
        logger.info("[Faces API] ===== DELETE FACE REQUEST END =====")
        logger.info("=" * 80)
        
        return {"success": True, "index_updated": index_updated}
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[Faces API] ❌ ERROR in delete_face")
        logger.error(f"[Faces API] Error type: {type(e).__name__}")
        logger.error(f"[Faces API] Error message: {str(e)}")
        logger.error(f"[Faces API] Traceback:", exc_info=True)
        logger.error("=" * 80)
        
        return {"success": False, "error": str(e)}


@router.post("/batch-save")
async def batch_save_faces(
    request: BatchSaveFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Save multiple faces with descriptors to database and rebuild index once.
    This is more efficient than calling /save multiple times.
    """
    try:
        logger.info("=" * 80)
        logger.info("[Faces API] ===== BATCH SAVE FACES REQUEST START =====")
        logger.info(f"[Faces API] Photo ID: {request.photo_id}")
        logger.info(f"[Faces API] Number of faces: {len(request.faces)}")
        
        logger.info(f"[Faces API] Deleting existing tags for photo {request.photo_id}")
        supabase_db.client.table("photo_faces").delete().eq("photo_id", request.photo_id).execute()
        
        saved_faces = []
        has_verified_faces = False
        
        for idx, face in enumerate(request.faces):
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
                logger.info(f"[Faces API] Face {idx+1}: Adding descriptor (dimension: {len(face.embedding)})")
            
            response = supabase_db.client.table("photo_faces").insert(insert_data).execute()
            
            if response.data:
                saved_faces.append(response.data[0])
                logger.info(f"[Faces API] ✓ Face {idx+1} saved with ID: {response.data[0].get('id')}")
            else:
                logger.error(f"[Faces API] Failed to save face {idx+1}")
        
        logger.info(f"[Faces API] ✓ Saved {len(saved_faces)} faces")
        
        index_updated = False
        if has_verified_faces:
            logger.info("[Faces API] Verified faces detected - rebuilding recognition index...")
            
            try:
                old_count = len(face_service.player_ids_map) if face_service.player_ids_map else 0
                logger.info(f"[Faces API] Current index size before rebuild: {old_count}")
                
                rebuild_result = await face_service.rebuild_players_index()
                
                if rebuild_result.get("success"):
                    index_updated = True
                    new_count = rebuild_result.get('new_descriptor_count', 0)
                    people_count = rebuild_result.get('unique_people_count', 0)
                    
                    logger.info(f"[Faces API] ✓ Index rebuilt: {old_count} -> {new_count} descriptors for {people_count} people")
                else:
                    logger.error(f"[Faces API] Index rebuild failed: {rebuild_result.get('error')}")
            except Exception as index_error:
                logger.error(f"[Faces API] Error rebuilding index: {str(index_error)}", exc_info=True)
        
        logger.info("[Faces API] ===== BATCH SAVE FACES REQUEST END =====")
        logger.info("=" * 80)
        
        return {
            "success": True,
            "data": saved_faces,
            "index_updated": index_updated,
            "saved_count": len(saved_faces)
        }
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[Faces API] ❌ ERROR in batch_save_faces")
        logger.error(f"[Faces API] Error message: {str(e)}")
        logger.error(f"[Faces API] Traceback:", exc_info=True)
        logger.error("=" * 80)
        
        return {
            "success": False,
            "error": str(e),
            "index_updated": False,
            "saved_count": 0
        }


@router.post("/verify", response_model=VerifyFaceResponse)
async def verify_face(
    request: VerifyFaceRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Verify a face by updating person_id and verified status.
    Backend reads embedding from DB and updates recognition index.
    Frontend sends ONLY: photo_face_id, person_id, verified
    """
    try:
        logger.info("=" * 80)
        logger.info("[Faces API] ===== VERIFY FACE REQUEST =====")
        logger.info(f"[Faces API] Photo Face ID: {request.photo_face_id}")
        logger.info(f"[Faces API] Person ID: {request.person_id}")
        logger.info(f"[Faces API] Verified: {request.verified}")
        
        # Get existing face with embedding from DB
        face_result = supabase_db.client.table("photo_faces") \
            .select("*, people(id, real_name)") \
            .eq("id", request.photo_face_id) \
            .single() \
            .execute()
        
        if not face_result.data:
            logger.error(f"[Faces API] Face not found: {request.photo_face_id}")
            return {"success": False, "error": "Face not found", "data": None}
        
        face_data = face_result.data
        embedding = face_data.get("insightface_descriptor")
        
        if not embedding:
            logger.error(f"[Faces API] Face has no embedding!")
            return {"success": False, "error": "Face has no embedding", "data": None}
        
        logger.info(f"[Faces API] Retrieved embedding from DB, length: {len(embedding)}")
        
        # Update photo_faces record
        update_data = {
            "person_id": request.person_id,
            "verified": request.verified,
            "recognition_confidence": 1.0 if request.verified else face_data.get("recognition_confidence")
        }
        
        update_result = supabase_db.client.table("photo_faces") \
            .update(update_data) \
            .eq("id", request.photo_face_id) \
            .execute()
        
        logger.info(f"[Faces API] Updated photo_faces record")
        
        # If verified, add descriptor to recognition index
        index_updated = False
        if request.verified and request.person_id:
            try:
                embedding_np = np.array(embedding, dtype=np.float32)
                await face_service.add_descriptor(request.person_id, embedding_np)
                index_updated = True
                logger.info(f"[Faces API] ✓ Added descriptor to recognition index")
            except Exception as e:
                logger.error(f"[Faces API] Failed to update index: {str(e)}")
        
        # Return updated face WITHOUT embedding
        final_result = supabase_db.client.table("photo_faces") \
            .select("id, photo_id, person_id, recognition_confidence, verified, insightface_bbox, people(id, real_name, telegram_name)") \
            .eq("id", request.photo_face_id) \
            .single() \
            .execute()
        
        logger.info("[Faces API] ===== VERIFY FACE REQUEST COMPLETE =====")
        logger.info("=" * 80)
        
        return {
            "success": True,
            "data": final_result.data,
            "error": None
        }
        
    except Exception as e:
        logger.error(f"[Faces API] Error: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e), "data": None}
