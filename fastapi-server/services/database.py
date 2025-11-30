def create_training_session(
        self,
        session_id: str,
        model_version: str,
        training_mode: str,
        context_weight: float,
        min_faces_per_person: int,
        status: str = "running"
    ) -> bool:
        """Создание новой сессии обучения"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS training_sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    model_version TEXT,
                    training_mode TEXT,
                    faces_count INTEGER,
                    people_count INTEGER,
                    context_weight REAL,
                    min_faces_per_person INTEGER,
                    metrics TEXT,
                    status TEXT
                )
            ''')
            
            cursor.execute('''
                INSERT INTO training_sessions 
                (session_id, model_version, training_mode, context_weight, min_faces_per_person, status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (session_id, model_version, training_mode, context_weight, min_faces_per_person, status))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[Database] Ошибка создания сессии обучения: {e}")
            return False
    
    def update_training_session(
        self,
        session_id: str,
        faces_count: int = None,
        people_count: int = None,
        metrics: Dict = None,
        status: str = None
    ) -> bool:
        """Обновление сессии обучения"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            updates = []
            params = []
            
            if faces_count is not None:
                updates.append("faces_count = ?")
                params.append(faces_count)
            
            if people_count is not None:
                updates.append("people_count = ?")
                params.append(people_count)
            
            if metrics is not None:
                updates.append("metrics = ?")
                params.append(json.dumps(metrics))
            
            if status is not None:
                updates.append("status = ?")
                params.append(status)
            
            if not updates:
                return True
            
            params.append(session_id)
            
            query = f"UPDATE training_sessions SET {', '.join(updates)} WHERE session_id = ?"
            cursor.execute(query, params)
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[Database] Ошибка обновления сессии: {e}")
            return False
    
    def get_training_sessions(self, limit: int = 10, offset: int = 0) -> List[Dict]:
        """Получение истории обучений"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT session_id, created_at, model_version, training_mode, 
                   faces_count, people_count, metrics, status
            FROM training_sessions
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        
        rows = cursor.fetchall()
        conn.close()
        
        sessions = []
        for row in rows:
            metrics = json.loads(row[6]) if row[6] else {}
            sessions.append({
                "id": row[0],
                "created_at": row[1],
                "model_version": row[2],
                "training_mode": row[3],
                "faces_count": row[4],
                "people_count": row[5],
                "metrics": metrics,
                "status": row[7]
            })
        
        return sessions
    
    def get_training_sessions_count(self) -> int:
        """Получение общего количества сессий обучения"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM training_sessions')
        count = cursor.fetchone()[0]
        
        conn.close()
        return count
