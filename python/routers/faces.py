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


class KeptFace(BaseModel):
    id: str
    person_id: Optional[str]


class BatchVerifyRequest(BaseModel):
    photo_id: str
    kept_faces: List[KeptFace]


@router.post("/batch")
async def get_batch_photo_faces(
    request: BatchPhotoIdsRequest,
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Get all faces for multiple photos in a single request.
    Used by GalleryImagesManager to display face statistics.
    """
    try:
        logger.info(f"[Faces API] Getting faces for {len(request.photo_ids)} photos")
        
        if not request.photo_ids:
            return {"success": True, "data": []}
        
        # Используются правильные поля из схемы: id, real_name, telegram_name
        result = supabase_db.client.table("photo_faces") \
            .select("*, people(id, real_name, telegram_name)") \
            .in_("photo_id", request.photo_ids) \
            .execute()
        
        if not result.data:
            return {"success": True, "data": []}
        
        logger.info(f"[Faces API] Found {len(result.data)} faces")
        return {"success": True, "data": result.data}
        
    except Exception as e:
        logger.error(f"[Faces API] Error getting batch faces: {str(e)}")
        return {"success": False, "error": str(e), "data": []}


@router.get("/photo/{photo_id}")
async def get_photo_faces(
    photo_id: str,
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Get all faces for a single photo.
    Used by FaceTaggingDialog to check if faces already exist before auto-detection.
    """
    try:
        logger.info(f"[Faces API] Getting faces for photo: {photo_id}")
        
        # Используются правильные поля из схемы: id, real_name, telegram_name
        result = supabase_db.client.table("photo_faces") \
            .select("*, people(id, real_name, telegram_name)") \
            .eq("photo_id", photo_id) \
            .execute()
        
        if not result.data:
            logger.info(f"[Faces API] No faces found for photo {photo_id}")
            return {"success": True, "data": []}
        
        logger.info(f"[Faces API] Found {len(result.data)} faces for photo {photo_id}")
        return {"success": True, "data": result.data}
        
    except Exception as e:
        logger.error(f"[Faces API] Error getting photo faces: {str(e)}")
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
        
        index_updated = False
        if request.verified and request.person_id and request.embedding and len(request.embedding) > 0:
            logger.info("[Faces API] Verified face detected - rebuilding recognition index...")
            
            try:
                rebuild_result = await face_service.rebuild_players_index()
                
                if rebuild_result.get("success"):
                    index_updated = True
                    logger.info(f"[Faces API] ✓ Index rebuilt successfully")
                else:
                    logger.error(f"[Faces API] Index rebuild failed: {rebuild_result.get('error')}")
            except Exception as index_error:
                logger.error(f"[Faces API] Error rebuilding index: {str(index_error)}", exc_info=True)
        
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
        logger.error(f"[Faces API] ❌ ERROR in save_face: {str(e)}", exc_info=True)
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
        
        # Delete the face
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
                    logger.info(f"[Faces API] ✓ Index rebuilt successfully")
                else:
                    logger.error(f"[Faces API] Index rebuild failed: {rebuild_result.get('error')}")
            except Exception as index_error:
                logger.error(f"[Faces API] Error rebuilding index: {str(index_error)}", exc_info=True)
        
        logger.info("[Faces API] ===== DELETE FACE REQUEST END =====")
        logger.info("=" * 80)
        
        return {"success": True, "index_updated": index_updated}
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[Faces API] ❌ ERROR in delete_face: {str(e)}", exc_info=True)
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
        
        # First delete all existing tags for this photo
        logger.info(f"[Faces API] Deleting existing tags for photo {request.photo_id}")
        supabase_db.client.table("photo_faces").delete().eq("photo_id", request.photo_id).execute()
        
        saved_faces = []
        has_verified_faces = False
        
        # Insert all faces
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
            
            response = supabase_db.client.table("photo_faces").insert(insert_data).execute()
            
            if response.data:
                saved_faces.append(response.data[0])
                logger.info(f"[Faces API] ✓ Face {idx+1} saved")
        
        logger.info(f"[Faces API] ✓ Saved {len(saved_faces)} faces")
        
        # Rebuild index once if any verified faces
        index_updated = False
        if has_verified_faces:
            logger.info("[Faces API] Verified faces detected - rebuilding recognition index...")
            
            try:
                rebuild_result = await face_service.rebuild_players_index()
                
                if rebuild_result.get("success"):
                    index_updated = True
                    logger.info(f"[Faces API] ✓ Index rebuilt successfully")
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
        logger.error(f"[Faces API] ❌ ERROR in batch_save_faces: {str(e)}", exc_info=True)
        logger.error("=" * 80)
        
        return {
            "success": False,
            "error": str(e),
            "index_updated": False,
            "saved_count": 0
        }


@router.post("/batch-verify")
async def batch_verify_faces(
    request: BatchVerifyRequest,
    face_service: FaceRecognitionService = Depends(lambda: face_service_instance),
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Batch verify faces: update kept faces and delete removed ones.
    Sets confidence=1.0 and verified=true only for faces with person_id.
    Updates gallery_images.verified based on whether all faces have person_id.
    """
    try:
        logger.info("=" * 80)
        logger.info("[Faces API] ===== BATCH VERIFY REQUEST START =====")
        logger.info(f"[Faces API] Photo ID: {request.photo_id}")
        logger.info(f"[Faces API] Kept faces count: {len(request.kept_faces)}")
        
        # Get all existing faces for this photo
        existing_response = supabase_db.client.table("photo_faces").select("id").eq(
            "photo_id", request.photo_id
        ).execute()
        
        existing_ids = [f["id"] for f in existing_response.data] if existing_response.data else []
        logger.info(f"[Faces API] Existing faces: {len(existing_ids)}")
        
        kept_ids = [f.id for f in request.kept_faces if f.id]
        
        # DELETE removed faces
        to_delete = [fid for fid in existing_ids if fid not in kept_ids]
        if len(to_delete) > 0:
            logger.info(f"[Faces API] Deleting {len(to_delete)} removed faces")
            for face_id in to_delete:
                supabase_db.client.table("photo_faces").delete().eq("id", face_id).execute()
            logger.info(f"[Faces API] ✓ Deleted {len(to_delete)} faces")
        
        # UPDATE kept faces
        all_have_person_id = True
        for face in request.kept_faces:
            face_id = face.id
            person_id = face.person_id
            
            if not person_id:
                all_have_person_id = False
            
            if face_id:
                update_data = {
                    "person_id": person_id,
                    "recognition_confidence": 1.0 if person_id else None,
                    "verified": bool(person_id),
                }
                
                supabase_db.client.table("photo_faces").update(update_data).eq("id", face_id).execute()
                logger.info(f"[Faces API] ✓ Updated face {face_id}: person_id={person_id}, confidence={update_data['recognition_confidence']}, verified={bool(person_id)}")
        
        logger.info(f"[Faces API] ✓ Batch verify completed. All faces have person_id: {all_have_person_id}")
        
        # Rebuild index if any faces have person_id
        index_updated = False
        if any(f.person_id for f in request.kept_faces):
            logger.info("[Faces API] Rebuilding recognition index...")
            
            try:
                rebuild_result = await face_service.rebuild_players_index()
                
                if rebuild_result.get("success"):
                    index_updated = True
                    logger.info(f"[Faces API] ✓ Index rebuilt successfully")
                else:
                    logger.error(f"[Faces API] Index rebuild failed: {rebuild_result.get('error')}")
            except Exception as index_error:
                logger.error(f"[Faces API] Error rebuilding index: {str(index_error)}", exc_info=True)
        
        logger.info("[Faces API] ===== BATCH VERIFY REQUEST END =====")
        logger.info("=" * 80)
        
        return {
            "success": True,
            "index_updated": index_updated,
            "verified": all_have_person_id
        }
        
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[Faces API] ❌ ERROR in batch_verify_faces: {str(e)}", exc_info=True)
        logger.error("=" * 80)
        
        return {
            "success": False,
            "error": str(e),
            "index_updated": False,
            "verified": False
        }


@router.get("/statistics")
async def get_face_statistics(
    confidence_threshold: Optional[float] = None,
    supabase_db: SupabaseDatabase = Depends(lambda: supabase_db_instance)
):
    """
    Get face recognition statistics for admin panel.
    
    Args:
        confidence_threshold: Minimum confidence for high-confidence faces (from config if not provided)
    
    Returns:
        Statistics including total people, verified faces, and high-confidence faces
    """
    try:
        logger.info(f"[Faces API] Getting face statistics with confidence_threshold={confidence_threshold}")
        
        config = await supabase_db.get_recognition_config()
        threshold = confidence_threshold or config.get('recognition_threshold', 0.60)
        
        # Count total people
        people_response = supabase_db.client.table("people").select("id", count="exact").execute()
        people_data = people_response.data or []
        total_people = people_response.count or 0
        
        # Get all photo_faces
        faces_response = supabase_db.client.table("photo_faces").select(
            "id, photo_id, person_id, verified, confidence"
        ).execute()
        
        faces = faces_response.data or []
        
        # Calculate statistics
        verified_count = len([f for f in faces if f.get("verified")])
        high_conf_count = len([
            f for f in faces 
            if f.get("confidence", 0) >= threshold and not f.get("verified")
        ])
        
        # Calculate per-person statistics
        faces_by_person = {}
        for face in faces:
            person_id = face.get("person_id")
            if not person_id:
                continue
            
            if person_id not in faces_by_person:
                faces_by_person[person_id] = []
            faces_by_person[person_id].append(face)
        
        people_stats = []
        for person in people_data:
            person_id = person["id"]
            person_faces = faces_by_person.get(person_id, [])
            
            # Get unique photo IDs
            verified_photo_ids = set(
                f["photo_id"] for f in person_faces if f.get("verified")
            )
            high_conf_photo_ids = set(
                f["photo_id"] for f in person_faces 
                if f.get("confidence", 0) >= threshold and not f.get("verified")
            )
            
            total_confirmed = len(verified_photo_ids) + len(high_conf_photo_ids)
            
            people_stats.append({
                "id": person_id,
                "verifiedPhotos": len(verified_photo_ids),
                "highConfidencePhotos": len(high_conf_photo_ids),
                "totalConfirmed": total_confirmed,
            })
        
        # Sort by total confirmed photos
        people_stats.sort(key=lambda x: x["totalConfirmed"], reverse=True)
        
        logger.info(f"[Faces API] Statistics: {total_people} people, {verified_count} verified faces, {high_conf_count} high-confidence faces")
        
        return {
            "success": True,
            "data": {
                "summary": {
                    "totalPeople": total_people,
                    "totalVerifiedFaces": verified_count,
                    "totalHighConfidenceFaces": high_conf_count,
                },
                "peopleStats": people_stats,
            }
        }
    except Exception as e:
        logger.error(f"[Faces API] Error getting statistics: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}
