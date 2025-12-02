from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from services.supabase_database import SupabaseDatabase
from services.face_recognition import FaceRecognitionService
import httpx
import os
from typing import Optional

router = APIRouter()

# Глобальные сервисы будут инжектированы из main.py
supabase_db: Optional[SupabaseDatabase] = None
face_service: Optional[FaceRecognitionService] = None

def set_services(db: SupabaseDatabase, face: FaceRecognitionService):
    """Инжектирует сервисы из main.py"""
    global supabase_db, face_service
    supabase_db = db
    face_service = face

class DeleteImageResponse(BaseModel):
    success: bool
    message: str
    had_descriptors: bool
    index_rebuilt: bool

@router.delete("/{image_id}", response_model=DeleteImageResponse)
async def delete_image(image_id: str):
    """
    Удаляет фото и все связанные данные (photo_faces, face_descriptors через CASCADE).
    Автоматически перестраивает индекс если были дескрипторы.
    """
    try:
        print(f"[Images API] Deleting image: {image_id}")
        
        # 1. Получаем URL фото для удаления из blob
        result = supabase_db.client.table("gallery_images")\
            .select("image_url")\
            .eq("id", image_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Image not found")
        
        image_url = result.data[0].get("image_url")
        
        # 2. Проверяем есть ли дескрипторы у этого фото
        descriptors_result = supabase_db.client.table("photo_faces")\
            .select("id, insightface_descriptor")\
            .eq("photo_id", image_id)\
            .execute()
        
        has_descriptors = any(
            face.get("insightface_descriptor") 
            for face in (descriptors_result.data or [])
        )
        
        print(f"[Images API] Image has descriptors: {has_descriptors}")
        
        # 3. Удаляем запись из gallery_images
        # CASCADE автоматически удалит photo_faces и face_descriptors
        delete_result = supabase_db.client.table("gallery_images")\
            .delete()\
            .eq("id", image_id)\
            .execute()
        
        print(f"[Images API] ✓ Image deleted from DB")
        
        # 4. Удаляем blob файл
        if image_url:
            try:
                blob_token = os.getenv("BLOB_READ_WRITE_TOKEN")
                if blob_token and image_url.startswith("https://"):
                    async with httpx.AsyncClient() as client:
                        await client.delete(
                            image_url,
                            headers={"Authorization": f"Bearer {blob_token}"}
                        )
                    print(f"[Images API] ✓ Blob file deleted")
            except Exception as e:
                print(f"[Images API] Warning: Failed to delete blob: {e}")
        
        # 5. Перестраиваем индекс если были дескрипторы
        index_rebuilt = False
        if has_descriptors:
            try:
                pre_count = len(face_service.players_embeddings) if face_service.players_embeddings else 0
                face_service.rebuild_index()
                post_count = len(face_service.players_embeddings) if face_service.players_embeddings else 0
                
                print(f"[Images API] ✓ Index rebuilt: {pre_count} -> {post_count} descriptors")
                index_rebuilt = True
            except Exception as e:
                print(f"[Images API] Warning: Failed to rebuild index: {e}")
        
        return DeleteImageResponse(
            success=True,
            message="Image deleted successfully",
            had_descriptors=has_descriptors,
            index_rebuilt=index_rebuilt
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Images API] Error deleting image: {e}")
        raise HTTPException(status_code=500, detail=str(e))
