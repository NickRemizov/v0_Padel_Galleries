import os
from typing import List, Dict, Optional
import numpy as np
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()


class SupabaseClient:
    def __init__(self):
        """Инициализация клиента Supabase"""
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        
        self.client: Client = create_client(supabase_url, supabase_key)
        print("[SupabaseClient] Initialized successfully")
    
    async def get_verified_faces(
        self,
        event_ids: Optional[List[str]] = None,
        person_ids: Optional[List[str]] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        min_faces_per_person: int = 3
    ) -> List[Dict]:
        """
        Получить verified faces из Supabase с фильтрами.
        
        Returns:
            List of dicts with face data including person info and photo URL
        """
        try:
            # Build query
            query = self.client.table("photo_faces").select(
                "id, person_id, insightface_bbox, photo_id, "
                "people(id, real_name), "
                "gallery_images(id, image_url, gallery_id, galleries(id, title, shoot_date))"
            ).eq("verified", True).not_.is_("person_id", "null")
            
            # Apply filters
            if person_ids:
                query = query.in_("person_id", person_ids)
            
            response = query.execute()
            faces_data = response.data
            
            # Filter by event_ids (gallery_ids) and dates if needed
            filtered_faces = []
            for face in faces_data:
                photo = face.get("gallery_images")
                if not photo:
                    continue
                
                gallery = photo.get("galleries")
                
                if event_ids and photo.get("gallery_id") not in event_ids:
                    continue
                
                # Filter by dates
                if gallery and date_from and gallery.get("shoot_date") < date_from:
                    continue
                if gallery and date_to and gallery.get("shoot_date") > date_to:
                    continue
                
                person = face.get("people")
                
                bbox = face["insightface_bbox"]
                if isinstance(bbox, str):
                    import json
                    bbox = json.loads(bbox)
                
                filtered_faces.append({
                    "face_id": face["id"],
                    "person_id": face["person_id"],
                    "person_name": person.get("real_name") if person else "Unknown",
                    "photo_id": face["photo_id"],  # Added photo_id
                    "photo_url": photo["image_url"],
                    "bbox": bbox,
                    "gallery_id": photo.get("gallery_id"),
                    "gallery_name": gallery.get("title") if gallery else None,
                    "gallery_date": gallery.get("shoot_date") if gallery else None
                })
            
            # Group by person_id and filter by min_faces_per_person
            person_faces = {}
            for face in filtered_faces:
                person_id = face["person_id"]
                if person_id not in person_faces:
                    person_faces[person_id] = []
                person_faces[person_id].append(face)
            
            # Filter out people with too few faces
            result = []
            for person_id, faces in person_faces.items():
                if len(faces) >= min_faces_per_person:
                    result.extend(faces)
            
            print(f"[SupabaseClient] Found {len(result)} verified faces from {len(person_faces)} people")
            return result
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting verified faces: {e}")
            raise ConnectionError(f"Failed to get verified faces from Supabase: {e}")
    
    async def get_verified_faces_with_descriptors(
        self,
        event_ids: Optional[List[str]] = None,
        person_ids: Optional[List[str]] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        min_faces_per_person: int = 3
    ) -> List[Dict]:
        """
        Получить verified faces с insightface_descriptor из Supabase.
        Включает поле insightface_descriptor для переиспользования.
        
        Returns:
            List of dicts with face data including descriptor if available
        """
        try:
            # Build query with insightface_descriptor
            query = self.client.table("photo_faces").select(
                "id, person_id, insightface_bbox, photo_id, insightface_descriptor, "
                "people(id, real_name), "
                "gallery_images(id, image_url, gallery_id, galleries(id, title, shoot_date))"
            ).eq("verified", True).not_.is_("person_id", "null")
            
            # Apply filters
            if person_ids:
                query = query.in_("person_id", person_ids)
            
            response = query.execute()
            faces_data = response.data
            
            # Filter by event_ids (gallery_ids) and dates if needed
            filtered_faces = []
            for face in faces_data:
                photo = face.get("gallery_images")
                if not photo:
                    continue
                
                gallery = photo.get("galleries")
                
                if event_ids and photo.get("gallery_id") not in event_ids:
                    continue
                
                # Filter by dates
                if gallery and date_from and gallery.get("shoot_date") < date_from:
                    continue
                if gallery and date_to and gallery.get("shoot_date") > date_to:
                    continue
                
                person = face.get("people")
                
                bbox = face["insightface_bbox"]
                if isinstance(bbox, str):
                    import json
                    bbox = json.loads(bbox)
                
                filtered_faces.append({
                    "face_id": face["id"],
                    "person_id": face["person_id"],
                    "person_name": person.get("real_name") if person else "Unknown",
                    "photo_id": face["photo_id"],
                    "photo_url": photo["image_url"],
                    "bbox": bbox,
                    "insightface_descriptor": face.get("insightface_descriptor"),  # Include descriptor
                    "gallery_id": photo.get("gallery_id"),
                    "gallery_name": gallery.get("title") if gallery else None,
                    "gallery_date": gallery.get("shoot_date") if gallery else None
                })
            
            # Group by person_id and filter by min_faces_per_person
            person_faces = {}
            for face in filtered_faces:
                person_id = face["person_id"]
                if person_id not in person_faces:
                    person_faces[person_id] = []
                person_faces[person_id].append(face)
            
            # Filter out people with too few faces
            result = []
            for person_id, faces in person_faces.items():
                if len(faces) >= min_faces_per_person:
                    result.extend(faces)
            
            print(f"[SupabaseClient] Found {len(result)} verified faces from {len(person_faces)} people")
            return result
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting verified faces: {e}")
            raise ConnectionError(f"Failed to get verified faces from Supabase: {e}")
    
    async def get_co_occurring_people(self, event_ids: List[str]) -> Dict[str, List[str]]:
        """
        Получить людей, которые часто встречаются вместе на событиях (галереях).
        
        Returns:
            Dict mapping person_id to list of co-occurring person_ids
        """
        try:
            response = self.client.table("photo_faces").select(
                "person_id, photo_id, gallery_images(gallery_id)"
            ).eq("verified", True).not_.is_("person_id", "null").execute()
            
            faces_data = response.data
            
            filtered_faces = [
                f for f in faces_data 
                if f.get("gallery_images") and f["gallery_images"].get("gallery_id") in event_ids
            ]
            
            # Group by photo_id to find co-occurring people
            photo_people = {}
            for face in filtered_faces:
                photo_id = face["photo_id"]
                person_id = face["person_id"]
                
                if photo_id not in photo_people:
                    photo_people[photo_id] = set()
                photo_people[photo_id].add(person_id)
            
            # Build co-occurrence graph
            co_occurring = {}
            for people_set in photo_people.values():
                people_list = list(people_set)
                for person_id in people_list:
                    if person_id not in co_occurring:
                        co_occurring[person_id] = []
                    
                    # Add all other people in the same photo
                    for other_person_id in people_list:
                        if other_person_id != person_id:
                            co_occurring[person_id].append(other_person_id)
            
            # Count occurrences and keep top co-occurring people
            result = {}
            for person_id, co_list in co_occurring.items():
                # Count occurrences
                from collections import Counter
                counter = Counter(co_list)
                # Keep top 10 most frequent
                top_co_occurring = [pid for pid, _ in counter.most_common(10)]
                result[person_id] = top_co_occurring
            
            print(f"[SupabaseClient] Found co-occurring people for {len(result)} people")
            return result
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting co-occurring people: {e}")
            return {}
    
    async def update_face_descriptor(
        self,
        face_id: str,
        descriptor: np.ndarray,
        confidence: float,
        bbox: Dict,
        training_context: Dict
    ):
        """
        Обновить insightface_descriptor и связанные поля в Supabase.
        """
        try:
            descriptor_list = descriptor.tolist() if isinstance(descriptor, np.ndarray) else descriptor
            
            # Convert confidence to native Python float
            confidence_float = float(confidence)
            
            # Convert bbox values to native Python types
            bbox_clean = {}
            for key, value in bbox.items():
                if isinstance(value, (np.integer, np.floating)):
                    bbox_clean[key] = float(value)
                else:
                    bbox_clean[key] = value
            
            # Convert training_context values to native Python types
            training_context_clean = {}
            for key, value in training_context.items():
                if isinstance(value, (np.integer, np.floating)):
                    training_context_clean[key] = float(value)
                elif isinstance(value, np.ndarray):
                    training_context_clean[key] = value.tolist()
                else:
                    training_context_clean[key] = value
            
            update_data = {
                "insightface_descriptor": descriptor_list,
                "insightface_confidence": confidence_float,
                "insightface_bbox": bbox_clean,
                "training_used": True,
                "training_context": training_context_clean
            }
            
            self.client.table("photo_faces").update(update_data).eq("id", face_id).execute()
            
        except Exception as e:
            print(f"[SupabaseClient] Error updating face descriptor: {e}")
            raise
    
    async def create_training_session(self, session_data: Dict) -> str:
        """
        Создать запись в face_training_sessions.
        
        Returns:
            session_id
        """
        try:
            response = self.client.table("face_training_sessions").insert(session_data).execute()
            session_id = response.data[0]["id"]
            print(f"[SupabaseClient] Created training session: {session_id}")
            return session_id
            
        except Exception as e:
            print(f"[SupabaseClient] Error creating training session: {e}")
            raise
    
    async def update_training_session(self, session_id: str, updates: Dict):
        """
        Обновить запись в face_training_sessions.
        """
        try:
            self.client.table("face_training_sessions").update(updates).eq("id", session_id).execute()
            
        except Exception as e:
            print(f"[SupabaseClient] Error updating training session: {e}")
            raise
    
    async def get_config(self) -> Dict:
        """
        Получить конфигурацию из face_recognition_config.
        
        Returns:
            Dict with config key-value pairs
        """
        try:
            response = self.client.table("face_recognition_config").select("key, value").execute()
            
            config = {}
            for row in response.data:
                config[row["key"]] = row["value"]
            
            return config
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting config: {e}")
            return {}
    
    async def update_config(self, key: str, value: Dict):
        """
        Обновить конфигурацию в face_recognition_config.
        """
        try:
            self.client.table("face_recognition_config").upsert({
                "key": key,
                "value": value
            }, on_conflict='key').execute()
            
            print(f"[SupabaseClient] Upserted config key '{key}': {value}")
            
        except Exception as e:
            print(f"[SupabaseClient] Error updating config: {e}")
            raise
    
    async def update_recognition_result(
        self,
        face_id: str,
        person_id: Optional[str],
        recognition_confidence: float,
        verified: bool = False,
        verified_by: Optional[str] = None
    ):
        """
        Обновить результат распознавания в photo_faces.
        Новый метод для сохранения результатов пакетного распознавания.
        
        Args:
            face_id: ID лица
            person_id: ID распознанного человека (None если не распознан)
            recognition_confidence: Уверенность классификатора (0-1)
            verified: Ручная верификация
            verified_by: ID админа, если verified=True
        """
        try:
            update_data = {
                "person_id": person_id,
                "recognition_confidence": float(recognition_confidence),
                "verified": verified
            }
            
            if verified and verified_by:
                update_data["verified_at"] = "now()"
                update_data["verified_by"] = verified_by
            
            self.client.table("photo_faces").update(update_data).eq("id", face_id).execute()
            
        except Exception as e:
            print(f"[SupabaseClient] Error updating recognition result: {e}")
            raise
    
    async def get_recognition_config(self) -> Dict:
        """
        Получить настройки распознавания из face_recognition_config.
        Загружает confidence_threshold и другие настройки.
        
        Returns:
            Dict with config including confidence_thresholds, quality_filters, etc.
        """
        try:
            config = await self.get_config()
            
            print(f"[SupabaseClient] Raw config from DB: {config}")
            
            defaults = {
                'confidence_thresholds': {
                    'low_data': 0.75,
                    'medium_data': 0.65,
                    'high_data': 0.55
                },
                'context_weight': 0.10,
                'min_faces_per_person': 3,
                'auto_retrain_threshold': 25,
                'auto_retrain_percentage': 0.10,
                'quality_filters': {
                    'min_detection_score': 0.70,
                    'min_face_size': 80,
                    'min_blur_score': 80
                }
            }
            
            # Merge with stored config
            result = defaults.copy()
            if 'recognition_settings' in config:
                stored_settings = config['recognition_settings']
                print(f"[SupabaseClient] Stored settings from DB: {stored_settings}")
                # Deep merge for nested objects
                if 'confidence_thresholds' in stored_settings:
                    result['confidence_thresholds'].update(stored_settings['confidence_thresholds'])
                if 'quality_filters' in stored_settings:
                    result['quality_filters'].update(stored_settings['quality_filters'])
                # Update top-level fields
                for key in ['context_weight', 'min_faces_per_person', 'auto_retrain_threshold', 'auto_retrain_percentage']:
                    if key in stored_settings:
                        result[key] = stored_settings[key]
            else:
                print(f"[SupabaseClient] No 'recognition_settings' key found in config, using defaults")
            
            print(f"[SupabaseClient] Final merged config: {result}")
            return result
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting recognition config: {e}")
            # Return defaults on error
            return {
                'confidence_thresholds': {
                    'low_data': 0.75,
                    'medium_data': 0.65,
                    'high_data': 0.55
                },
                'context_weight': 0.10,
                'min_faces_per_person': 3,
                'auto_retrain_threshold': 25,
                'auto_retrain_percentage': 0.10,
                'quality_filters': {
                    'min_detection_score': 0.70,
                    'min_face_size': 80,
                    'min_blur_score': 80
                }
            }
    
    async def update_recognition_config(self, settings: Dict):
        """
        Обновить настройки распознавания.
        Сохраняет confidence_threshold и другие настройки.
        """
        try:
            await self.update_config('recognition_settings', settings)
            print(f"[SupabaseClient] Updated recognition config: {settings}")
            
        except Exception as e:
            print(f"[SupabaseClient] Error updating recognition config: {e}")
            raise
    
    async def get_unknown_faces_from_gallery(self, gallery_id: str) -> List[Dict]:
        """
        Получить неизвестные лица из галереи (person_id = NULL).
        
        Returns:
            List of dicts with face data including insightface_descriptor
        """
        try:
            print(f"[SupabaseClient] Getting unknown faces from gallery {gallery_id}")
            
            # Сначала получаем все photo_ids из этой галереи
            gallery_photos_response = self.client.table("gallery_images").select(
                "id"
            ).eq("gallery_id", gallery_id).execute()
            
            if not gallery_photos_response.data:
                print(f"[SupabaseClient] No photos found in gallery {gallery_id}")
                return []
            
            photo_ids = [photo["id"] for photo in gallery_photos_response.data]
            print(f"[SupabaseClient] Found {len(photo_ids)} photos in gallery")
            
            # Теперь получаем ВСЕ лица из этих фото где person_id = NULL (независимо от наличия дескриптора)
            response = self.client.table("photo_faces").select(
                "id, photo_id, insightface_descriptor, insightface_bbox, insightface_confidence, "
                "gallery_images(id, image_url, gallery_id)"
            ).in_("photo_id", photo_ids).is_("person_id", "null").execute()
            
            print(f"[SupabaseClient] Query returned {len(response.data) if response.data else 0} faces with person_id=NULL")
            
            if not response.data:
                print(f"[SupabaseClient] No unknown faces found")
                return []
            
            # Формируем результат, фильтруем только те, у которых есть дескриптор И bbox
            filtered_faces = []
            faces_without_descriptor = 0
            faces_without_bbox = 0
            for face in response.data:
                photo = face.get("gallery_images")
                if not photo:
                    print(f"[SupabaseClient] Face {face['id']} has no photo data, skipping")
                    continue
                
                # Проверяем наличие дескриптора
                if not face.get("insightface_descriptor"):
                    faces_without_descriptor += 1
                    continue
                
                # Проверяем наличие bbox
                if not face.get("insightface_bbox"):
                    faces_without_bbox += 1
                    print(f"[SupabaseClient] Face {face['id']} has no bbox (legacy data?), skipping")
                    continue
                
                filtered_faces.append({
                    "id": face["id"],
                    "photo_id": face["photo_id"],
                    "photo_url": photo["image_url"],
                    "insightface_descriptor": face["insightface_descriptor"],
                    "insightface_bbox": face["insightface_bbox"],
                    "insightface_confidence": face["insightface_confidence"]
                })
            
            print(f"[SupabaseClient] Found {len(filtered_faces)} unknown faces with descriptors and bbox")
            print(f"[SupabaseClient] Skipped {faces_without_descriptor} faces without descriptors")
            print(f"[SupabaseClient] Skipped {faces_without_bbox} faces without bbox (legacy data)")
            print(f"[SupabaseClient] Total unknown faces in gallery: {len(response.data)}")
            return filtered_faces
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting unknown faces: {e}")
            import traceback
            traceback.print_exc()
            raise

    def get_training_history(self, limit: int = 10, offset: int = 0) -> List[Dict]:
        """
        Получить историю обучений из face_training_sessions.
        """
        try:
            response = self.client.table("face_training_sessions").select(
                "*"
            ).order("created_at", desc=True).limit(limit).offset(offset).execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting training history: {e}")
            return []
    
    def get_training_sessions_count(self) -> int:
        """
        Получить общее количество сессий обучения.
        """
        try:
            response = self.client.table("face_training_sessions").select(
                "id", count="exact"
            ).execute()
            
            return response.count if response.count is not None else 0
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting training sessions count: {e}")
            return 0
    
    def get_training_session(self, session_id: str) -> Optional[Dict]:
        """
        Получить сессию обучения по ID.
        """
        try:
            response = self.client.table("face_training_sessions").select(
                "*"
            ).eq("id", session_id).execute()
            
            return response.data[0] if response.data else None
            
        except Exception as e:
            print(f"[SupabaseClient] Error getting training session: {e}")
            return None
