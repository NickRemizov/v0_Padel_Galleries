import sqlite3
import json
import numpy as np
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import os

class PlayerDatabase:
    def __init__(self, db_path: str = "players.db"):
        """Инициализация базы данных игроков"""
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self):
        """Создание таблиц базы данных"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Таблица игроков
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS players (
                player_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица эмбеддингов лиц игроков
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS player_embeddings (
                embedding_id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                embedding BLOB NOT NULL,
                source_image TEXT,
                confidence REAL,
                is_verified BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES players(player_id)
            )
        ''')
        
        # Таблица галерей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS galleries (
                gallery_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                event_date DATE,
                location TEXT,
                total_photos INTEGER DEFAULT 0,
                processed_photos INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица распознанных лиц в галереях
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS gallery_faces (
                face_id TEXT PRIMARY KEY,
                gallery_id TEXT NOT NULL,
                image_name TEXT NOT NULL,
                bbox TEXT,
                embedding BLOB NOT NULL,
                player_id TEXT,
                confidence REAL,
                is_verified BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (gallery_id) REFERENCES galleries(gallery_id),
                FOREIGN KEY (player_id) REFERENCES players(player_id)
            )
        ''')
        
        # Таблица фидбека для дообучения
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feedback (
                feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
                face_id TEXT NOT NULL,
                old_player_id TEXT,
                new_player_id TEXT NOT NULL,
                user_email TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (face_id) REFERENCES gallery_faces(face_id)
            )
        ''')
        
        # Таблица training_sessions (локальная копия для кэша)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS training_sessions (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                training_mode TEXT NOT NULL,
                faces_count INTEGER,
                people_count INTEGER,
                context_weight REAL,
                min_faces_per_person INTEGER,
                metrics TEXT,
                status TEXT DEFAULT 'running'
            )
        ''')
        
        # Таблица training_cache (кэш скачанных фото)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS training_cache (
                photo_url TEXT PRIMARY KEY,
                local_path TEXT NOT NULL,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица training_config (локальная копия конфига)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS training_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        print("[Database] База данных инициализирована")
    
    def add_player(self, player_id: str, name: str, email: str = None, 
                   phone: str = None, notes: str = None) -> bool:
        """Добавление нового игрока"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO players (player_id, name, email, phone, notes)
                VALUES (?, ?, ?, ?, ?)
            ''', (player_id, name, email, phone, notes))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[Database] Ошибка добавления игрока: {e}")
            return False
    
    def add_player_embedding(self, embedding_id: str, player_id: str, 
                            embedding: np.ndarray, source_image: str = None,
                            confidence: float = 1.0, is_verified: bool = True) -> bool:
        """Добавление эмбеддинга лица игрока"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Сериализуем numpy array в bytes
            embedding_bytes = embedding.tobytes()
            
            cursor.execute('''
                INSERT INTO player_embeddings 
                (embedding_id, player_id, embedding, source_image, confidence, is_verified)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (embedding_id, player_id, embedding_bytes, source_image, confidence, is_verified))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[Database] Ошибка добавления эмбеддинга: {e}")
            return False
    
    def get_all_player_embeddings(self) -> Tuple[List[str], List[np.ndarray]]:
        """Получение всех эмбеддингов игроков для поиска"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT player_id, embedding FROM player_embeddings
            WHERE is_verified = 1
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        player_ids = []
        embeddings = []
        
        for player_id, embedding_bytes in rows:
            # Десериализуем bytes обратно в numpy array
            embedding = np.frombuffer(embedding_bytes, dtype=np.float32)
            player_ids.append(player_id)
            embeddings.append(embedding)
        
        return player_ids, embeddings
    
    def get_player_info(self, player_id: str) -> Optional[Dict]:
        """Получение информации об игроке"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT player_id, name, email, phone, notes, created_at
            FROM players WHERE player_id = ?
        ''', (player_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "player_id": row[0],
                "name": row[1],
                "email": row[2],
                "phone": row[3],
                "notes": row[4],
                "created_at": row[5]
            }
        return None
    
    def get_all_players(self) -> List[Dict]:
        """Получение списка всех игроков"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT p.player_id, p.name, p.email, COUNT(pe.embedding_id) as embeddings_count
            FROM players p
            LEFT JOIN player_embeddings pe ON p.player_id = pe.player_id
            GROUP BY p.player_id
            ORDER BY p.name
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                "player_id": row[0],
                "name": row[1],
                "email": row[2],
                "embeddings_count": row[3]
            }
            for row in rows
        ]
    
    def create_gallery(self, gallery_id: str, name: str, event_date: str = None,
                      location: str = None, total_photos: int = 0) -> bool:
        """Создание новой галереи"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO galleries (gallery_id, name, event_date, location, total_photos)
                VALUES (?, ?, ?, ?, ?)
            ''', (gallery_id, name, event_date, location, total_photos))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[Database] Ошибка создания галереи: {e}")
            return False
    
    def add_gallery_face(self, face_id: str, gallery_id: str, image_name: str,
                        bbox: List[float], embedding: np.ndarray, 
                        player_id: str = None, confidence: float = 0.0) -> bool:
        """Добавление распознанного лица в галерею"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            embedding_bytes = embedding.tobytes()
            bbox_json = json.dumps(bbox)
            
            cursor.execute('''
                INSERT INTO gallery_faces 
                (face_id, gallery_id, image_name, bbox, embedding, player_id, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (face_id, gallery_id, image_name, bbox_json, embedding_bytes, 
                  player_id, confidence))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[Database] Ошибка добавления лица: {e}")
            return False
    
    def update_face_player(self, face_id: str, new_player_id: str, 
                          confidence: float, user_email: str = None) -> bool:
        """Обновление привязки лица к игроку (фидбек)"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Получаем старый player_id
            cursor.execute('SELECT player_id FROM gallery_faces WHERE face_id = ?', (face_id,))
            row = cursor.fetchone()
            old_player_id = row[0] if row else None
            
            # Обновляем привязку
            cursor.execute('''
                UPDATE gallery_faces 
                SET player_id = ?, confidence = ?, is_verified = 1
                WHERE face_id = ?
            ''', (new_player_id, confidence, face_id))
            
            # Сохраняем фидбек
            cursor.execute('''
                INSERT INTO feedback (face_id, old_player_id, new_player_id, user_email)
                VALUES (?, ?, ?, ?)
            ''', (face_id, old_player_id, new_player_id, user_email))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[Database] Ошибка обновления лица: {e}")
            return False
    
    def get_gallery_stats(self, gallery_id: str) -> Dict:
        """Получение статистики по галерее"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total_faces,
                COUNT(player_id) as recognized_faces,
                COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_faces
            FROM gallery_faces
            WHERE gallery_id = ?
        ''', (gallery_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        return {
            "total_faces": row[0],
            "recognized_faces": row[1],
            "verified_faces": row[2]
        }
    
    def get_gallery_faces(self, gallery_id: str, player_id: str = None) -> List[Dict]:
        """Получение лиц из галереи"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if player_id:
            cursor.execute('''
                SELECT face_id, image_name, bbox, player_id, confidence, is_verified
                FROM gallery_faces
                WHERE gallery_id = ? AND player_id = ?
            ''', (gallery_id, player_id))
        else:
            cursor.execute('''
                SELECT face_id, image_name, bbox, player_id, confidence, is_verified
                FROM gallery_faces
                WHERE gallery_id = ?
            ''', (gallery_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                "face_id": row[0],
                "image_name": row[1],
                "bbox": json.loads(row[2]),
                "player_id": row[3],
                "confidence": row[4],
                "is_verified": bool(row[5])
            }
            for row in rows
        ]
    
    def save_training_session(self, session_id: str, data: Dict):
        """Сохранить сессию обучения в локальную БД"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO training_sessions 
            (id, training_mode, faces_count, people_count, context_weight, 
             min_faces_per_person, metrics, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            session_id,
            data['training_mode'],
            data['faces_count'],
            data['people_count'],
            data['context_weight'],
            data['min_faces_per_person'],
            json.dumps(data.get('metrics', {})),
            data['status']
        ))
        conn.commit()
        conn.close()
    
    def update_training_session(self, session_id: str, updates: Dict):
        """Обновить статус сессии обучения"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        set_clauses = []
        values = []
        for key, value in updates.items():
            if key == 'metrics':
                value = json.dumps(value)
            set_clauses.append(f"{key} = ?")
            values.append(value)
        
        values.append(session_id)
        query = f"UPDATE training_sessions SET {', '.join(set_clauses)} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
        conn.close()
    
    def get_training_session(self, session_id: str) -> Optional[Dict]:
        """Получить сессию обучения по ID"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM training_sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        return {
            'id': row[0],
            'created_at': row[1],
            'training_mode': row[2],
            'faces_count': row[3],
            'people_count': row[4],
            'context_weight': row[5],
            'min_faces_per_person': row[6],
            'metrics': json.loads(row[7]) if row[7] else {},
            'status': row[8]
        }
    
    def get_training_history(self, limit: int = 10, offset: int = 0) -> List[Dict]:
        """Получить историю обучений"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM training_sessions 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                'id': r[0],
                'created_at': r[1],
                'training_mode': r[2],
                'faces_count': r[3],
                'people_count': r[4],
                'context_weight': r[5],
                'min_faces_per_person': r[6],
                'metrics': json.loads(r[7]) if r[7] else {},
                'status': r[8]
            }
            for r in rows
        ]
    
    def save_photo_cache(self, photo_url: str, local_path: str):
        """Сохранить информацию о кэшированном фото"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO training_cache (photo_url, local_path)
            VALUES (?, ?)
        ''', (photo_url, local_path))
        conn.commit()
        conn.close()
    
    def get_cached_photo(self, photo_url: str) -> Optional[str]:
        """Получить путь к кэшированному фото"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT local_path FROM training_cache WHERE photo_url = ?",
            (photo_url,)
        )
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None
    
    def save_config(self, key: str, value: Dict):
        """Сохранить конфигурацию в локальную БД"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO training_config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        ''', (key, json.dumps(value)))
        conn.commit()
        conn.close()
    
    def get_config(self) -> Dict:
        """Получить всю конфигурацию из локальной БД"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM training_config")
        rows = cursor.fetchall()
        conn.close()
        
        config = {}
        for key, value in rows:
            config[key] = json.loads(value)
        return config
