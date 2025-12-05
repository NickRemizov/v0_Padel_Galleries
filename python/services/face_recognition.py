import os
import numpy as np
from insightface.app import FaceAnalysis
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import base64
import tempfile
import uuid
import shutil
import zipfile
import io
from PIL import Image
import cv2
import hnswlib
import hdbscan

from fastapi import UploadFile

import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from services.supabase_database import SupabaseDatabase

class FaceRecognitionService:
    """Сервис для детекции и распознавания лиц на фотографиях"""
    
    def __init__(self, supabase_db: 'SupabaseDatabase' = None):
        """Инициализация модели InsightFace"""
        print("[FaceRecognition] Initializing FaceAnalysis model...")
        self.app = None
        self.supabase_db = supabase_db if supabase_db else SupabaseDatabase()
        print("[v3.0] SupabaseDatabase connected successfully")
        
        # Хранилище эмбеддингов и данных (для временных операций)
        self.embeddings_store: Dict[str, List[np.ndarray]] = {}
        self.faces_data_store: Dict[str, List[Dict]] = {}
        self.index_store: Dict[str, Any] = {}
        
        self.players_index = None
        self.player_ids_map = []
        
        self.quality_filters = {
            "min_detection_score": 0.7,
            "min_face_size": 80,
            "min_blur_score": 80  # Updated default min_blur_score from 10 to 80
        }
        
        print("[FaceRecognition] FaceRecognitionService created (awaiting initialization)")
    
    def _ensure_model_unpacked(self):
        """Проверка и распаковка модели antelopev2 если нужно"""
        home_dir = Path.home()
        model_dir = home_dir / ".insightface" / "models" / "antelopev2"
        model_zip = home_dir / ".insightface" / "models" / "antelopev2.zip"
        
        print(f"[FaceRecognition] Checking model antelopev2...")
        print(f"[FaceRecognition] Model path: {model_dir}")
        print(f"[FaceRecognition] Zip path: {model_zip}")
        
        # Проверяем существует ли распакованная модель
        if model_dir.exists():
            files = list(model_dir.glob("*.onnx"))
            print(f"[FaceRecognition] Model folder exists, found .onnx files: {len(files)}")
            if len(files) > 0:
                print(f"[FaceRecognition] Model already unpacked: {[f.name for f in files]}")
                return True
            else:
                print(f"[FaceRecognition] Model folder is empty, need unpacking")
        else:
            print(f"[FaceRecognition] Model folder does not exist")
        
        # Проверяем существует ли архив
        if not model_zip.exists():
            print(f"[FaceRecognition] ERROR: Model zip not found: {model_zip}")
            print(f"[FaceRecognition] InsightFace should have downloaded it automatically")
            return False
        
        print(f"[FaceRecognition] Zip found, size: {model_zip.stat().st_size} bytes")
        print(f"[FaceRecognition] Starting model unpacking...")
        
        try:
            # Создаем директорию если не существует
            model_dir.mkdir(parents=True, exist_ok=True)
            print(f"[FaceRecognition] Directory created: {model_dir}")
            
            # Распаковываем архив
            with zipfile.ZipFile(model_zip, 'r') as zip_ref:
                file_list = zip_ref.namelist()
                print(f"[FaceRecognition] Files in zip: {len(file_list)}")
                print(f"[FaceRecognition] File list: {file_list[:10]}")  # Первые 10 файлов
                
                zip_ref.extractall(model_dir)
                print(f"[FaceRecognition] Zip extracted to {model_dir}")
            
            subfolder = model_dir / "antelopev2"
            if subfolder.exists() and subfolder.is_dir():
                print(f"[FaceRecognition] Found antelopev2/ subfolder, moving files to root...")
                import shutil
                
                # Перемещаем все файлы из подпапки в корень
                for item in subfolder.iterdir():
                    if item.is_file():
                        dest = model_dir / item.name
                        print(f"[FaceRecognition] Moving {item.name} -> {dest}")
                        shutil.move(str(item), str(dest))
                
                # Удаляем пустую подпапку
                subfolder.rmdir()
                print(f"[FaceRecognition] Subfolder deleted, files moved to root")
            
            # Проверяем что файлы распаковались
            onnx_files = list(model_dir.glob("*.onnx"))
            print(f"[FaceRecognition] Found .onnx files after unpacking: {len(onnx_files)}")
            print(f"[FaceRecognition] Files: {[f.name for f in onnx_files]}")
            
            if len(onnx_files) == 0:
                print(f"[FaceRecognition] ERROR: No .onnx files found after unpacking!")
                # Проверяем что вообще распаковалось
                all_files = list(model_dir.rglob("*"))
                print(f"[FaceRecognition] Total files in directory: {len(all_files)}")
                for f in all_files[:20]:  # Первые 20 файлов
                    print(f"[FaceRecognition]   - {f.relative_to(model_dir)}")
                return False
            
            print(f"[FaceRecognition] Model successfully unpacked!")
            return True
            
        except Exception as e:
            print(f"[FaceRecognition] ERROR unpacking model: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"[FaceRecognition] Traceback:\n{traceback.format_exc()}")
            return False
    
    def _ensure_initialized(self):
        """Ленивая инициализация InsightFace при первом использовании"""
        if self.app is None:
            print("[FaceRecognition] ========== STARTING INSIGHTFACE INITIALIZATION ==========")
            
            try:
                home_dir = Path.home()
                model_dir = home_dir / ".insightface" / "models" / "antelopev2"
                model_zip = home_dir / ".insightface" / "models" / "antelopev2.zip"
                
                print(f"[FaceRecognition] Step 1: Checking model existence...")
                print(f"[FaceRecognition] Model path: {model_dir}")
                print(f"[FaceRecognition] Zip path: {model_zip}")
                
                model_ready = False
                if model_dir.exists():
                    onnx_files = list(model_dir.glob("*.onnx"))
                    if len(onnx_files) > 0:
                        print(f"[FaceRecognition] ✓ Model already unpacked: {len(onnx_files)} .onnx files")
                        model_ready = True
                    else:
                        print(f"[FaceRecognition] Model folder exists, but no .onnx files")
                else:
                    print(f"[FaceRecognition] Model folder does not exist")
                
                if not model_ready:
                    print(f"[FaceRecognition] Step 2: Checking model zip...")
                    
                    # Если архив уже есть - распаковываем
                    if model_zip.exists():
                        print(f"[FaceRecognition] Zip found, unpacking...")
                        if not self._ensure_model_unpacked():
                            raise RuntimeError("Failed to unpack existing model zip")
                        model_ready = True
                    else:
                        print(f"[FaceRecognition] Zip not found, InsightFace should download it")
                        
                        print(f"[FaceRecognition] Creating temporary FaceAnalysis for downloading...")
                        try:
                            temp_app = FaceAnalysis(
                                name='antelopev2',
                                providers=['CPUExecutionProvider']
                            )
                            print(f"[FaceRecognition] Temporary FaceAnalysis created")
                            del temp_app  # Удаляем временный объект
                        except Exception as e:
                            print(f"[FaceRecognition] Error creating temporary FaceAnalysis: {e}")
                        
                        import time
                        max_wait = 30  # Максимум 30 секунд ожидания
                        waited = 0
                        while not model_zip.exists() and waited < max_wait:
                            print(f"[FaceRecognition] Waiting for model zip download... ({waited}s)")
                            time.sleep(2)
                            waited += 2
                        
                        if not model_zip.exists():
                            raise RuntimeError(f"InsightFace did not download model zip after {max_wait}s")
                        
                        print(f"[FaceRecognition] ✓ Model zip downloaded by InsightFace")
                        
                        print(f"[FaceRecognition] Unpacking downloaded zip...")
                        if not self._ensure_model_unpacked():
                            raise RuntimeError("Failed to unpack downloaded model zip")
                        model_ready = True
                
                if not model_ready:
                    raise RuntimeError("Model not ready after all initialization attempts")
                
                print(f"[FaceRecognition] Step 3: Model ready, creating FaceAnalysis...")
                
                self.app = FaceAnalysis(
                    name='antelopev2',
                    providers=['CPUExecutionProvider']
                )
                print(f"[FaceRecognition] ✓ FaceAnalysis created successfully")
                
                # Шаг 4: Загружаем модели в память
                print("[FaceRecognition] Step 4: Loading models into memory (prepare)...")
                self.app.prepare(ctx_id=-1, det_size=(640, 640))
                print("[FaceRecognition] ✓ prepare() completed successfully")
                
                # Шаг 5: Проверяем что модели загружены
                print("[FaceRecognition] Step 5: Checking loaded models...")
                if hasattr(self.app, 'models'):
                    models_list = list(self.app.models.keys())
                    print(f"[FaceRecognition] ✓ Models loaded: {models_list}")
                    
                    if 'detection' not in models_list:
                        print(f"[FaceRecognition] ✗ ERROR: 'detection' model not found!")
                        print(f"[FaceRecognition] Checking model directory contents...")
                        if model_dir.exists():
                            all_files = list(model_dir.glob("*"))
                            print(f"[FaceRecognition] Files in {model_dir}:")
                            for f in all_files:
                                print(f"[FaceRecognition]   - {f.name} ({f.stat().st_size} bytes)")
                        raise RuntimeError("'detection' model not loaded")
                else:
                    print(f"[FaceRecognition] WARNING: app.models is not accessible")
                
                # Шаг 6: Загружаем индекс игроков
                print("[FaceRecognition] Step 6: Loading players index...")
                self._load_players_index()
                
                print("[FaceRecognition] ========== INSIGHTFACE READY FOR USE ==========")
                
            except Exception as e:
                print(f"[FaceRecognition] ========== CRITICAL INITIALIZATION ERROR ==========")
                print(f"[FaceRecognition] Error type: {type(e).__name__}")
                print(f"[FaceRecognition] Error message: {str(e)}")
                import traceback
                print(f"[FaceRecognition] Full traceback:\n{traceback.format_exc()}")
                print(f"[FaceRecognition] =========================================================")
                raise
    
    def _load_players_index(self):
        """
        Загрузка индекса известных игроков из Supabase PostgreSQL.
        """
        print("[FaceRecognition] Loading players index...")
        
        try:
            print("[FaceRecognition] Loading embeddings from Supabase PostgreSQL...")
            player_ids, embeddings = self.supabase_db.get_all_player_embeddings()
            
            if len(embeddings) > 0:
                print(f"[FaceRecognition] ✓ Loaded {len(embeddings)} embeddings from Supabase")
                
                # Create HNSW index
                dim = len(embeddings[0])
                self.players_index = hnswlib.Index(space='cosine', dim=dim)
                self.players_index.init_index(
                    max_elements=len(embeddings) * 2,
                    ef_construction=200,
                    M=16
                )
                
                embeddings_array = np.array(embeddings)
                self.players_index.add_items(embeddings_array, np.arange(len(embeddings)))
                self.players_index.set_ef(50)
                
                self.player_ids_map = player_ids
                print(f"[FaceRecognition] ✓ HNSW index created: {len(embeddings)} embeddings for {len(set(player_ids))} unique people")
                return
            else:
                print("[FaceRecognition] No embeddings found in Supabase, initialization failed.")
                raise ValueError("No embeddings found in Supabase")
        except Exception as e:
            print(f"[FaceRecognition] ERROR loading from Supabase: {e}")
            raise
    
    def is_ready(self) -> bool:
        """Проверка готовности сервиса"""
        self._ensure_initialized()
        return self.app is not None
    
    async def add_player_to_archive(
        self,
        player_id: str,
        name: str,
        photos: List[UploadFile],
        email: str = None,
        phone: str = None,
        notes: str = None
    ) -> Dict:
        """Добавление игрока в архив с фотографиями"""
        self._ensure_initialized()
        
        # Добавляем игрока в базу
        self.supabase_db.add_player(player_id, name, email, phone, notes)
        
        # Обрабатываем фотографии игрока
        embeddings_added = 0
        
        for photo in photos:
            contents = await photo.read()
            image = Image.open(io.BytesIO(contents))
            img_array = np.array(image.convert('RGB'))
            img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            
            # Детектируем лица
            faces = self.app.get(img_array)
            
            # Берем самое большое лицо (предполагаем, что это игрок)
            if len(faces) > 0:
                face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                embedding = face.embedding
                
                embedding_id = str(uuid.uuid4())
                self.supabase_db.add_player_embedding(
                    embedding_id,
                    player_id,
                    embedding,
                    photo.filename,
                    float(face.det_score),
                    is_verified=True
                )
                embeddings_added += 1
        
        # Перезагружаем индекс игроков
        self._load_players_index()
        
        return {
            "player_id": player_id,
            "name": name,
            "embeddings_added": embeddings_added
        }
    
    async def process_gallery_batch(
        self,
        gallery_id: str,
        files: List[UploadFile],
        batch_size: int = 10
    ) -> Dict:
        """Пакетная обработка галереи фотографий с распознаванием игроков"""
        self._ensure_initialized()
        
        total_faces = 0
        recognized_faces = 0
        
        for i in range(0, len(files), batch_size):
            batch = files[i:i + batch_size]
            
            for file in batch:
                contents = await file.read()
                image = Image.open(io.BytesIO(contents))
                img_array = np.array(image.convert('RGB'))
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                
                # Детектируем лица
                faces = self.app.get(img_array)
                total_faces += len(faces)
                
                for face in faces:
                    face_id = str(uuid.uuid4())
                    embedding = face.embedding
                    bbox = [float(x) for x in face.bbox]
                    
                    # Ищем игрока в базе
                    player_id = None
                    confidence = 0.0
                    
                    if self.players_index is not None:
                        labels, distances = self.players_index.knn_query(
                            embedding.reshape(1, -1),
                            k=1
                        )
                        
                        similarity = 1 - distances[0][0]
                        if similarity > 0.6:  # 60% схожести
                            player_id = self.player_ids_map[labels[0][0]]
                            confidence = float(similarity)
                            recognized_faces += 1
                    
                    # Сохраняем лицо в базу
                    self.supabase_db.add_gallery_face(
                        face_id,
                        gallery_id,
                        file.filename,
                        bbox,
                        embedding,
                        player_id,
                        confidence
                    )
            
            print(f"[FaceRecognition] Processed {min(i + batch_size, len(files))}/{len(files)} photos")
        
        return {
            "total_photos": len(files),
            "total_faces": total_faces,
            "recognized_faces": recognized_faces,
            "recognition_rate": (recognized_faces / total_faces * 100) if total_faces > 0 else 0
        }
    
    async def process_uploaded_photos(
        self, 
        files: List[UploadFile], 
        tournament_id: Optional[str]
    ) -> List[Dict]:
        """Обработка загруженных фотографий и извлечение лиц"""
        print(f"[FaceRecognition] process_uploaded_photos called with {len(files)} files")
        
        try:
            self._ensure_initialized()
            print("[FaceRecognition] InsightFace initialized successfully")
        except Exception as e:
            print(f"[FaceRecognition] ERROR initializing InsightFace: {str(e)}")
            raise
        
        if not tournament_id:
            tournament_id = str(uuid.uuid4())
            print(f"[FaceRecognition] Created new tournament_id: {tournament_id}")
        
        all_faces = []
        embeddings = []
        
        for idx, file in enumerate(files):
            print(f"[FaceRecognition] Processing file {idx+1}/{len(files)}: {file.filename}")
            
            try:
                # Читаем изображение
                print(f"[FaceRecognition] Reading file content {file.filename}...")
                contents = await file.read()
                print(f"[FaceRecognition] Read {len(contents)} bytes")
                
                print(f"[FaceRecognition] Opening image via PIL...")
                image = Image.open(io.BytesIO(contents))
                print(f"[FaceRecognition] Image opened: size {image.size}, mode {image.mode}")
                
                print(f"[FaceRecognition] Converting to numpy array...")
                img_array = np.array(image.convert('RGB'))
                print(f"[FaceRecognition] Numpy array created: shape {img_array.shape}")
                
                print(f"[FaceRecognition] Converting RGB -> BGR for OpenCV...")
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                
                # Детектируем лица
                print(f"[FaceRecognition] Starting face detection for {file.filename}...")
                faces = self.app.get(img_array)
                print(f"[FaceRecognition] Detected {len(faces)} faces in {file.filename}")
                
                for face_idx, face in enumerate(faces):
                    print(f"[FaceRecognition] Processing face {face_idx+1}/{len(faces)} from {file.filename}")
                    face_id = str(uuid.uuid4())
                    embedding = face.embedding
                    print(f"[FaceRecognition] Embedding extracted: dimension {len(embedding)}, det_score={face.det_score}")
                    
                    # Сохраняем данные лица
                    face_data = {
                        "face_id": face_id,
                        "image_name": file.filename,
                        "bbox": [float(x) for x in face.bbox],
                        "confidence": float(face.det_score),
                        "embedding": embedding.tolist()
                    }
                    
                    all_faces.append(face_data)
                    embeddings.append(embedding)
                    print(f"[FaceRecognition] Face {face_id} added to results")
                
            except Exception as e:
                print(f"[FaceRecognition] ERROR processing file {file.filename}: {type(e).__name__}: {str(e)}")
                import traceback
                print(f"[FaceRecognition] Traceback:\n{traceback.format_exc()}")
                # Продолжаем обработку остальных файлов
                continue
        
        print(f"[FaceRecognition] Total faces processed: {len(all_faces)}")
        
        # Сохраняем в хранилище
        if tournament_id not in self.embeddings_store:
            self.embeddings_store[tournament_id] = []
            self.faces_data_store[tournament_id] = []
            print(f"[FaceRecognition] Created new storage for tournament_id: {tournament_id}")
        
        self.embeddings_store[tournament_id].extend(embeddings)
        self.faces_data_store[tournament_id].extend(all_faces)
        print(f"[FaceRecognition] Data saved to storage: {len(embeddings)} embeddings")
        
        # Создаем/обновляем HNSW индекс для быстрого поиска
        print(f"[FaceRecognition] Building HNSW index...")
        await self._build_hnsw_index(tournament_id)
        print(f"[FaceRecognition] HNSW index built")
        
        print(f"[FaceRecognition] process_uploaded_photos completed: returning {len(all_faces)} faces")
        return all_faces
    
    async def _build_hnsw_index(self, tournament_id: str):
        """Построение HNSW индекса для быстрого поиска похожих лиц"""
        embeddings = self.embeddings_store[tournament_id]
        
        if len(embeddings) == 0:
            return
        
        dim = len(embeddings[0])
        num_elements = len(embeddings)
        
        # Создаем индекс
        index = hnswlib.Index(space='cosine', dim=dim)
        index.init_index(max_elements=num_elements * 2, ef_construction=200, M=16)
        
        # Добавляем эмбеддинги
        embeddings_array = np.array(embeddings)
        index.add_items(embeddings_array, np.arange(num_elements))
        
        # Настраиваем параметры поиска
        index.set_ef(50)
        
        self.index_store[tournament_id] = index
        print(f"[FaceRecognition] HNSW index built for {num_elements} faces")
    
    async def group_faces(
        self, 
        tournament_id: Optional[str],
        min_cluster_size: int = 3
    ) -> Tuple[List[Dict], List[Dict]]:
        """Группировка лиц с помощью HDBSCAN"""
        print(f"[FaceRecognition] group_faces called: tournament_id={tournament_id}, min_cluster_size={min_cluster_size}")
        
        if not tournament_id or tournament_id not in self.embeddings_store:
            print(f"[FaceRecognition] ERROR: Tournament not found or no data")
            print(f"[FaceRecognition] Available tournament_ids: {list(self.embeddings_store.keys())}")
            raise ValueError("Tournament not found or no data for clustering")
        
        embeddings = np.array(self.embeddings_store[tournament_id])
        faces_data = self.faces_data_store[tournament_id]
        print(f"[FaceRecognition] Loaded {len(embeddings)} embeddings for clustering")
        
        if len(embeddings) < min_cluster_size:
            print(f"[FaceRecognition] ERROR: Not enough faces ({len(embeddings)} < {min_cluster_size})")
            raise ValueError(f"Not enough faces for clustering (minimum {min_cluster_size})")
        
        print(f"[FaceRecognition] Starting HDBSCAN clustering...")
        
        # Применяем HDBSCAN для автоматической кластеризации
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=2,
            metric='euclidean',
            cluster_selection_epsilon=0.5
        )
        
        cluster_labels = clusterer.fit_predict(embeddings)
        print(f"[FaceRecognition] HDBSCAN completed: found {len(set(cluster_labels))} unique labels")
        
        # Группируем лица по кластерам
        groups_dict: Dict[int, List[Dict]] = {}
        ungrouped_faces: List[Dict] = []
        noise_count = 0
        
        for face_data, label in zip(faces_data, cluster_labels):
            if label == -1:  # Шум (не вошло ни в одну группу)
                noise_count += 1
                ungrouped_faces.append(face_data)
                continue
            
            if label not in groups_dict:
                groups_dict[label] = []
            
            groups_dict[label].append(face_data)
        
        print(f"[FaceRecognition] Noise (ungrouped): {noise_count} faces")
        print(f"[FaceRecognition] Found groups: {len(groups_dict)}")
        
        # Формируем результат
        groups = []
        for cluster_id, faces in groups_dict.items():
            print(f"[FaceRecognition] Group {cluster_id}: {len(faces)} faces")
            
            # Получаем уникальные имена изображений для превью (максимум 5)
            unique_images = list(set([f["image_name"] for f in faces]))[:5]
            
            group = {
                "group_id": f"player_{cluster_id}",
                "player_name": f"Player {cluster_id + 1}",
                "faces_count": len(faces),
                "faces": faces,
                "confidence": float(np.mean([f["confidence"] for f in faces])),
                "sample_images": unique_images
            }
            groups.append(group)
        
        # Сохраняем несгруппированные лица для последующего извлечения
        self.faces_data_store[f"{tournament_id}_ungrouped"] = ungrouped_faces
        
        print(f"[FaceRecognition] group_faces completed: returning {len(groups)} groups and {len(ungrouped_faces)} ungrouped faces")
        return groups, ungrouped_faces
    
    async def apply_feedback(
        self,
        face_id: str,
        new_player_id: str,
        confidence: float,
        user_email: str = None
    ):
        """Применение фидбека пользователя для улучшения распознавания"""
        
        success = self.supabase_db.update_face_player(face_id, new_player_id, confidence, user_email)
        
        if success:
            print(f"[FaceRecognition] Feedback applied: {face_id} -> {new_player_id}")
            
            # Например, добавить эмбеддинг в архив игрока для улучшения будущих распознаваний
        
        return success
    
    async def clear_tournament_data(self, tournament_id: Optional[str] = None):
        """Очистка данных турнира"""
        print(f"[FaceRecognition] clear_tournament_data called: tournament_id={tournament_id}")
        
        if tournament_id:
            removed_embeddings = len(self.embeddings_store.get(tournament_id, []))
            self.embeddings_store.pop(tournament_id, None)
            self.faces_data_store.pop(tournament_id, None)
            self.index_store.pop(tournament_id, None)
            print(f"[FaceRecognition] Tournament data {tournament_id} cleared ({removed_embeddings} embeddings removed)")
        else:
            total_embeddings = sum(len(v) for v in self.embeddings_store.values())
            self.embeddings_store.clear()
            self.faces_data_store.clear()
            self.index_store.clear()
            print(f"[FaceRecognition] All data cleared ({total_embeddings} embeddings removed)")
    
    async def get_gallery_results(self, gallery_id: str) -> Dict:
        """Получение результатов распознавания для галереи"""
        stats = self.supabase_db.get_gallery_stats(gallery_id)
        faces = self.supabase_db.get_gallery_faces(gallery_id)
        
        # Группируем по игрокам
        players_dict = {}
        for face in faces:
            player_id = face.get("player_id")
            if player_id:
                if player_id not in players_dict:
                    player_info = self.supabase_db.get_player_info(player_id)
                    players_dict[player_id] = {
                        "player_id": player_id,
                        "name": player_info.get("name") if player_info else "Unknown",
                        "faces": []
                    }
                players_dict[player_id]["faces"].append(face)
        
        return {
            "stats": stats,
            "players": list(players_dict.values()),
            "unrecognized_faces": [f for f in faces if not f.get("player_id")]
        }
    
    async def recognize_face(
        self,
        embedding: np.ndarray,
        confidence_threshold: float = 0.60
    ) -> Tuple[Optional[str], Optional[float]]:
        """
        Распознать лицо по эмбеддингу с порогом confidence.
        
        Args:
            embedding: 512-мерный эмбеддинг от InsightFace
            confidence_threshold: Минимальный порог для верифицированных лиц (0-1)
                                 Для неверифицированных используется более высокий порог
        
        Returns:
            Tuple of (person_id, confidence) or (None, None) if below threshold
        """
        try:
            # Для верифицированных лиц порог ниже (0.60), для неверифицированных выше (0.75)
            unverified_threshold = confidence_threshold + 0.15
            verified_threshold = confidence_threshold
            
            print(f"[FaceRecognition] Searching in HNSWLIB index (verified threshold={verified_threshold:.2f}, unverified threshold={unverified_threshold:.2f})")
            
            # Safety check: if index is None, try to load it
            if self.players_index is None:
                print("[FaceRecognition] WARNING: Index is None, attempting to initialize...")
                try:
                    self._load_players_index()
                    print("[FaceRecognition] ✓ Index initialized successfully")
                except Exception as init_error:
                    print(f"[FaceRecognition] ERROR: Cannot initialize index: {init_error}")
                    print("[FaceRecognition] Returning None - no recognition possible without index")
                    return None, None
            
            # Find nearest neighbor
            labels, distances = self.players_index.knn_query(
                embedding.reshape(1, -1),
                k=1
            )
            
            # Convert cosine distance to similarity
            similarity = 1 - distances[0][0]
            raw_confidence = float(similarity)
            
            person_id = self.player_ids_map[labels[0][0]]
            
            if raw_confidence >= verified_threshold:
                print(f"[FaceRecognition] ✓ Match found: person_id={person_id}")
                print(f"[FaceRecognition]   Confidence: {raw_confidence:.3f}")
                
                return person_id, raw_confidence
            else:
                print(f"[FaceRecognition] Confidence {raw_confidence:.3f} below threshold {verified_threshold:.2f}, returning None")
                return None, None
                
        except Exception as e:
            print(f"[FaceRecognition] ERROR during recognition: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"[FaceRecognition] Traceback:\n{traceback.format_exc()}")
            return None, None

    async def rebuild_players_index(self) -> Dict:
        """
        Rebuild the HNSWLIB index from Supabase database.
        Call this after adding new face descriptors to make them available for recognition.
        
        Returns:
            Dict with rebuild statistics
        """
        print("[FaceRecognition] Rebuilding players index...")
        
        try:
            old_count = len(self.player_ids_map) if self.player_ids_map else 0
            
            # Reload index from database
            self._load_players_index()
            
            new_count = len(self.player_ids_map) if self.player_ids_map else 0
            unique_people = len(set(self.player_ids_map)) if self.player_ids_map else 0
            
            print(f"[FaceRecognition] ✓ Index rebuilt: {old_count} -> {new_count} descriptors for {unique_people} people")
            
            return {
                "success": True,
                "old_descriptor_count": old_count,
                "new_descriptor_count": new_count,
                "unique_people_count": unique_people
            }
            
        except Exception as e:
            print(f"[FaceRecognition] ERROR rebuilding index: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"[FaceRecognition] Traceback:\n{traceback.format_exc()}")
            return {
                "success": False,
                "error": str(e)
            }

    async def detect_faces(
        self, 
        image_url: str, 
        apply_quality_filters: bool = True,
        min_detection_score: Optional[float] = None,
        min_face_size: Optional[float] = None,
        min_blur_score: Optional[float] = None
    ) -> List[Dict]:
        """
        Detect faces on an image from URL with optional quality filtering
        
        Args:
            image_url: URL of the image to process
            apply_quality_filters: Whether to apply quality filters (default: True)
            min_detection_score: Minimum detection confidence score
            min_face_size: Minimum face size in pixels
            min_blur_score: Minimum blur score
        
        Returns:
            List of detected faces with bbox, det_score, blur_score, and embedding
        """
        self._ensure_initialized()
        
        if min_detection_score is not None or min_face_size is not None or min_blur_score is not None:
            # Temporarily override quality filters
            original_filters = self.quality_filters.copy()
            if min_detection_score is not None:
                self.quality_filters["min_detection_score"] = min_detection_score
            if min_face_size is not None:
                self.quality_filters["min_face_size"] = min_face_size
            if min_blur_score is not None:
                self.quality_filters["min_blur_score"] = min_blur_score
            print(f"[FaceRecognition] Temporarily overriding quality filters: {self.quality_filters}")
        
        if apply_quality_filters:
            print(f"[FaceRecognition] detect_faces called with URL: {image_url}, apply_quality_filters=True")
            print(f"[FaceRecognition] Quality filters: {self.quality_filters}")

        try:
            # Download image from URL
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url, timeout=30.0)
                response.raise_for_status()
                image_bytes = response.content
            
            print(f"[FaceRecognition] Downloaded {len(image_bytes)} bytes from URL")
            
            # Open image
            image = Image.open(io.BytesIO(image_bytes))
            img_array = np.array(image.convert('RGB'))
            img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            
            print(f"[FaceRecognition] Image converted to array: shape {img_array.shape}")
            
            # Detect faces
            faces = self.app.get(img_array)
            print(f"[FaceRecognition] Detected {len(faces)} faces before filtering")
            
            filtered_results = []
            filtered_count = 0
            
            for idx, face in enumerate(faces):
                # Calculate blur score
                blur_score = self.calculate_blur_score(img_array, face.bbox)
                
                # Calculate face size
                face_width = face.bbox[2] - face.bbox[0]
                face_height = face.bbox[3] - face.bbox[1]
                face_size = min(face_width, face_height)
                
                if apply_quality_filters:
                    passes, reason = self.passes_quality_filters(
                        face.det_score,
                        face.bbox,
                        blur_score
                    )
                    
                    print(f"[FaceRecognition] Face {idx+1}: det_score={face.det_score:.3f}, size={face_size:.0f}px, blur={blur_score:.1f} - {reason}")
                    
                    if not passes:
                        filtered_count += 1
                        continue
                else:
                    print(f"[FaceRecognition] Face {idx+1}: det_score={face.det_score:.3f}, size={face_size:.0f}px, blur={blur_score:.1f} - KEPT (no filtering)")
                
                filtered_results.append({
                    "bbox": face.bbox,
                    "det_score": face.det_score,
                    "blur_score": blur_score,
                    "embedding": face.embedding
                })
            
            if apply_quality_filters:
                print(f"[FaceRecognition] After filtering: {len(filtered_results)} faces kept, {filtered_count} filtered out")
            else:
                print(f"[FaceRecognition] No filtering applied: {len(filtered_results)} faces kept")
            
            # Restore original quality filters
            if min_detection_score is not None or min_face_size is not None or min_blur_score is not None:
                self.quality_filters = original_filters
                print(f"[FaceRecognition] Restored original quality filters: {self.quality_filters}")
            
            return filtered_results
            
        except Exception as e:
            print(f"[FaceRecognition] ERROR in detect_faces: {type(e).__name__}: {str(e)}")
            import traceback
            print(f"[FaceRecognition] Traceback:\n{traceback.format_exc()}")
            raise

    def calculate_blur_score(self, image: np.ndarray, bbox: List[float]) -> float:
        """
        Calculate blur score using Laplacian variance.
        Higher score = sharper image.
        
        Args:
            image: Full image array (BGR format)
            bbox: Face bounding box [x1, y1, x2, y2]
            
        Returns:
            Blur score (Laplacian variance). Typical range:
            - < 50: Very blurry
            - 50-100: Blurry
            - 100-200: Acceptable
            - > 200: Sharp
        """
        try:
            # Extract face region
            x1, y1, x2, y2 = [int(coord) for coord in bbox]
            
            # Add padding (10%) to include some context
            h, w = image.shape[:2]
            padding_x = int((x2 - x1) * 0.1)
            padding_y = int((y2 - y1) * 0.1)
            
            x1 = max(0, x1 - padding_x)
            y1 = max(0, y1 - padding_y)
            x2 = min(w, x2 + padding_x)
            y2 = min(h, y2 + padding_y)
            
            face_region = image[y1:y2, x1:x2]
            
            # Convert to grayscale
            gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
            
            # Calculate Laplacian variance
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            variance = laplacian.var()
            
            return float(variance)
            
        except Exception as e:
            print(f"[FaceRecognition] Error calculating blur score: {e}")
            return 0.0
    
    def passes_quality_filters(
        self, 
        det_score: float, 
        bbox: List[float], 
        blur_score: float
    ) -> Tuple[bool, str]:
        """
        Check if face passes quality filters.
        
        Args:
            det_score: Detection confidence (0-1)
            bbox: Bounding box [x1, y1, x2, y2]
            blur_score: Blur score from calculate_blur_score
            
        Returns:
            Tuple of (passes: bool, reason: str)
        """
        # Check detection score
        if det_score < self.quality_filters["min_detection_score"]:
            return False, f"det_score {det_score:.2f} < {self.quality_filters['min_detection_score']}"
        
        # Check face size
        face_width = bbox[2] - bbox[0]
        face_height = bbox[3] - bbox[1]
        face_size = min(face_width, face_height)
        
        if face_size < self.quality_filters["min_face_size"]:
            return False, f"face_size {face_size:.0f}px < {self.quality_filters['min_face_size']}px"
        
        # Check blur score
        if blur_score < self.quality_filters["min_blur_score"]:
            return False, f"blur_score {blur_score:.1f} < {self.quality_filters['min_blur_score']}"
        
        return True, "passed"
    
    async def load_quality_filters(self):
        """Load quality filters from database config"""
        try:
            config = self.supabase_db.get_recognition_config()
            
            if 'quality_filters' in config:
                self.quality_filters = config['quality_filters']
                print(f"[FaceRecognition] Quality filters loaded from DB: {self.quality_filters}")
            else:
                print(f"[FaceRecognition] No quality filters in config, using defaults: {self.quality_filters}")
        except Exception as e:
            print(f"[FaceRecognition] Error loading quality filters: {e}, using defaults")
            print(f"[FaceRecognition] Default quality filters: {self.quality_filters}")

    async def update_quality_filters(self, filters: Dict):
        """Update quality filters in database and cache"""
        try:
            await self.supabase_db.update_recognition_config({
                "quality_filters": filters
            })
            self.quality_filters = filters
            print(f"[FaceRecognition] Quality filters updated in DB: {filters}")
        except Exception as e:
            print(f"[FaceRecognition] Error updating quality filters: {e}")
            raise
