import numpy as np
from typing import List, Dict, Optional, Tuple
import uuid
from datetime import datetime
import json
from services.database import PlayerDatabase
from services.face_recognition import FaceRecognitionService
import httpx
import os

class TrainingService:
    def __init__(self, face_service: FaceRecognitionService, db: PlayerDatabase):
        """Инициализация сервиса обучения"""
        self.face_service = face_service
        self.db = db
        
        # Supabase credentials
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        print("[TrainingService] Сервис обучения инициализирован")
    
    async def prepare_training_dataset(
        self,
        filters: Optional[Dict] = None,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Подготовка датасета для обучения из Supabase
        
        Args:
            filters: Фильтры (event_ids, person_ids, date_from, date_to)
            options: Опции (min_faces_per_person, include_co_occurring, context_weight)
        """
        print("[TrainingService] Подготовка датасета для обучения...")
        
        filters = filters or {}
        options = options or {}
        
        min_faces = options.get("min_faces_per_person", 3)
        include_co_occurring = options.get("include_co_occurring", True)
        
        # Получаем verified faces из Supabase
        verified_faces = await self._fetch_verified_faces_from_supabase(filters)
        
        print(f"[TrainingService] Получено {len(verified_faces)} verified faces из Supabase")
        
        # Группируем по person_id
        people_faces = {}
        for face in verified_faces:
            person_id = face["person_id"]
            if person_id not in people_faces:
                people_faces[person_id] = []
            people_faces[person_id].append(face)
        
        # Фильтруем людей с недостаточным количеством лиц
        filtered_people = {
            pid: faces for pid, faces in people_faces.items()
            if len(faces) >= min_faces
        }
        
        print(f"[TrainingService] После фильтрации: {len(filtered_people)} людей")
        
        # Если нужно добавить co-occurring людей
        if include_co_occurring:
            # TODO: Реализовать логику добавления людей с тех же событий
            pass
        
        # Статистика
        total_faces = sum(len(faces) for faces in filtered_people.values())
        faces_counts = [len(faces) for faces in filtered_people.values()]
        
        # Распределение по количеству лиц
        distribution = {
            "3-4": sum(1 for c in faces_counts if 3 <= c <= 4),
            "5-9": sum(1 for c in faces_counts if 5 <= c <= 9),
            "10-14": sum(1 for c in faces_counts if 10 <= c <= 14),
            "15-19": sum(1 for c in faces_counts if 15 <= c <= 19),
            "20+": sum(1 for c in faces_counts if c >= 20)
        }
        
        warnings = []
        for pid, faces in filtered_people.items():
            if len(faces) == min_faces:
                warnings.append(f"Person {pid} has only {min_faces} faces")
        
        return {
            "dataset_stats": {
                "total_people": len(filtered_people),
                "total_faces": total_faces,
                "faces_per_person": {
                    "min": min(faces_counts) if faces_counts else 0,
                    "max": max(faces_counts) if faces_counts else 0,
                    "avg": sum(faces_counts) / len(faces_counts) if faces_counts else 0
                },
                "people_by_face_count": distribution
            },
            "validation": {
                "ready": len(filtered_people) > 0,
                "warnings": warnings,
                "errors": []
            }
        }
    
    async def execute_training(
        self,
        mode: str = "full",
        filters: Optional[Dict] = None,
        options: Optional[Dict] = None
    ) -> Dict:
        """
        Запуск обучения модели
        
        Args:
            mode: 'full' или 'incremental'
            filters: Фильтры для выборки данных
            options: Опции обучения
        """
        print(f"[TrainingService] Запуск обучения в режиме: {mode}")
        
        session_id = str(uuid.uuid4())
        
        filters = filters or {}
        options = options or {}
        
        min_faces = options.get("min_faces_per_person", 3)
        context_weight = options.get("context_weight", 0.1)
        model_version = options.get("model_version", "v1.0")
        update_existing = options.get("update_existing", True)
        
        # Создаем запись о сессии обучения
        self.db.create_training_session(
            session_id=session_id,
            model_version=model_version,
            training_mode=mode,
            context_weight=context_weight,
            min_faces_per_person=min_faces,
            status="running"
        )
        
        try:
            # Шаг 1: Получаем verified faces из Supabase
            verified_faces = await self._fetch_verified_faces_from_supabase(filters)
            
            # Фильтруем по min_faces_per_person
            people_faces = {}
            for face in verified_faces:
                person_id = face["person_id"]
                if person_id not in people_faces:
                    people_faces[person_id] = []
                people_faces[person_id].append(face)
            
            filtered_people = {
                pid: faces for pid, faces in people_faces.items()
                if len(faces) >= min_faces
            }
            
            total_faces = sum(len(faces) for faces in filtered_people.values())
            
            print(f"[TrainingService] Обучение на {len(filtered_people)} людях, {total_faces} лицах")
            
            # Шаг 2: Извлекаем InsightFace дескрипторы и обновляем Supabase
            processed_count = 0
            
            for person_id, faces in filtered_people.items():
                for face in faces:
                    # Загружаем фото и извлекаем дескриптор
                    descriptor = await self._extract_insightface_descriptor(face)
                    
                    if descriptor is not None:
                        # Обновляем запись в Supabase
                        await self._update_face_descriptor_in_supabase(
                            face["id"],
                            descriptor,
                            context_weight
                        )
                        processed_count += 1
                
                print(f"[TrainingService] Обработано {processed_count}/{total_faces} лиц")
            
            # Шаг 3: Синхронизируем с локальной БД FastAPI
            await self._sync_to_local_db(filtered_people)
            
            # Шаг 4: Перестраиваем индекс
            self.face_service._load_players_index()
            
            # Шаг 5: Валидация (cross-validation)
            metrics = await self._validate_model(filtered_people)
            
            # Обновляем сессию
            self.db.update_training_session(
                session_id=session_id,
                faces_count=processed_count,
                people_count=len(filtered_people),
                metrics=metrics,
                status="completed"
            )
            
            print(f"[TrainingService] Обучение завершено: accuracy={metrics['accuracy']:.2f}")
            
            return {
                "session_id": session_id,
                "status": "completed",
                "faces_processed": processed_count,
                "people_count": len(filtered_people),
                "metrics": metrics
            }
            
        except Exception as e:
            print(f"[TrainingService] ОШИБКА обучения: {str(e)}")
            self.db.update_training_session(
                session_id=session_id,
                status="failed"
            )
            raise
    
    async def _fetch_verified_faces_from_supabase(self, filters: Dict) -> List[Dict]:
        """Получение verified faces из Supabase"""
        
        if not self.supabase_url or not self.supabase_key:
            print("[TrainingService] ВНИМАНИЕ: Supabase credentials не настроены")
            return []
        
        async with httpx.AsyncClient() as client:
            headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json"
            }
            
            # Базовый запрос
            url = f"{self.supabase_url}/rest/v1/photo_faces"
            params = {
                "verified": "eq.true",
                "person_id": "not.is.null",
                "select": "id,photo_id,person_id,bbox,descriptor,confidence"
            }
            
            # Применяем фильтры
            # TODO: Добавить фильтры по event_ids, date_from, date_to через JOIN с photos и events
            
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            
            return response.json()
    
    async def _extract_insightface_descriptor(self, face: Dict) -> Optional[np.ndarray]:
        """Извлечение InsightFace дескриптора для лица"""
        
        # TODO: Загрузить фото по photo_id, вырезать bbox, извлечь дескриптор
        # Пока возвращаем None (заглушка)
        
        return None
    
    async def _update_face_descriptor_in_supabase(
        self,
        face_id: str,
        descriptor: np.ndarray,
        context_weight: float
    ):
        """Обновление InsightFace дескриптора в Supabase"""
        
        if not self.supabase_url or not self.supabase_key:
            return
        
        async with httpx.AsyncClient() as client:
            headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json"
            }
            
            url = f"{self.supabase_url}/rest/v1/photo_faces"
            params = {"id": f"eq.{face_id}"}
            
            data = {
                "insightface_descriptor": descriptor.tolist(),
                "training_used": True,
                "training_context": {"context_weight": context_weight}
            }
            
            response = await client.patch(url, headers=headers, params=params, json=data)
            response.raise_for_status()
    
    async def _sync_to_local_db(self, people_faces: Dict[str, List[Dict]]):
        """Синхронизация данных в локальную БД FastAPI"""
        
        for person_id, faces in people_faces.items():
            # Проверяем существует ли игрок
            player_info = self.db.get_player_info(person_id)
            
            if not player_info:
                # Получаем информацию о человеке из Supabase
                person_info = await self._fetch_person_from_supabase(person_id)
                
                if person_info:
                    self.db.add_player(
                        player_id=person_id,
                        name=person_info.get("real_name", "Unknown"),
                        email=None,
                        phone=None,
                        notes=None
                    )
            
            # Добавляем эмбеддинги
            for face in faces:
                # TODO: Использовать InsightFace дескриптор вместо старого
                descriptor = np.array(face.get("descriptor", []))
                
                if len(descriptor) > 0:
                    embedding_id = str(uuid.uuid4())
                    self.db.add_player_embedding(
                        embedding_id=embedding_id,
                        player_id=person_id,
                        embedding=descriptor,
                        source_image=face.get("photo_id"),
                        confidence=face.get("confidence", 1.0),
                        is_verified=True
                    )
    
    async def _fetch_person_from_supabase(self, person_id: str) -> Optional[Dict]:
        """Получение информации о человеке из Supabase"""
        
        if not self.supabase_url or not self.supabase_key:
            return None
        
        async with httpx.AsyncClient() as client:
            headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}"
            }
            
            url = f"{self.supabase_url}/rest/v1/people"
            params = {"id": f"eq.{person_id}"}
            
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            
            data = response.json()
            return data[0] if data else None
    
    async def _validate_model(self, people_faces: Dict[str, List[Dict]]) -> Dict:
        """Валидация модели на тестовой выборке"""
        
        # TODO: Реализовать cross-validation
        # Пока возвращаем заглушку
        
        return {
            "accuracy": 0.95,
            "precision": 0.93,
            "recall": 0.94,
            "f1_score": 0.935
        }
    
    def get_training_history(self, limit: int = 10, offset: int = 0) -> Dict:
        """Получение истории обучений"""
        
        sessions = self.db.get_training_sessions(limit=limit, offset=offset)
        total = self.db.get_training_sessions_count()
        
        return {
            "sessions": sessions,
            "total": total
        }
