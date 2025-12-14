"""
Unified Supabase client.
Consolidates all database operations in one place.

This replaces:
- services/supabase_client.py
- services/supabase_database.py
"""

import json
from typing import List, Dict, Optional, Tuple, Any
from functools import lru_cache
import numpy as np
from supabase import create_client, Client

from core.config import settings
from core.exceptions import DatabaseError, NotFoundError
from core.logging import get_logger

logger = get_logger(__name__)


class SupabaseClient:
    """
    Unified Supabase client for all database operations.
    
    Provides:
    - Connection management
    - Query execution with error handling
    - Pagination support
    - Type conversion utilities
    """
    
    def __init__(self):
        """Initialize Supabase client."""
        self._client: Optional[Client] = None
        self._connect()
    
    def _connect(self):
        """Establish connection to Supabase."""
        try:
            self._client = create_client(
                settings.supabase_url,
                settings.supabase_service_role_key
            )
            logger.info("Supabase client initialized")
        except Exception as e:
            logger.error(f"Failed to connect to Supabase: {e}")
            raise DatabaseError(str(e), operation="connect")
    
    @property
    def client(self) -> Client:
        """Get raw Supabase client for direct queries."""
        if not self._client:
            self._connect()
        return self._client
    
    # ============================================================
    # Generic Query Methods
    # ============================================================
    
    def table(self, name: str):
        """Get table reference for chaining."""
        return self.client.table(name)
    
    async def execute_query(
        self,
        table: str,
        operation: str,
        **kwargs
    ) -> Any:
        """
        Execute a query with error handling.
        
        Args:
            table: Table name
            operation: Operation type (select, insert, update, delete)
            **kwargs: Operation-specific arguments
        
        Returns:
            Query result data
        """
        try:
            query = self.client.table(table)
            
            if operation == "select":
                query = query.select(kwargs.get("columns", "*"))
                if kwargs.get("filters"):
                    for key, value in kwargs["filters"].items():
                        query = query.eq(key, value)
            elif operation == "insert":
                query = query.insert(kwargs.get("data"))
            elif operation == "update":
                query = query.update(kwargs.get("data"))
                if kwargs.get("filters"):
                    for key, value in kwargs["filters"].items():
                        query = query.eq(key, value)
            elif operation == "delete":
                if kwargs.get("filters"):
                    for key, value in kwargs["filters"].items():
                        query = query.eq(key, value)
            
            response = query.execute()
            return response.data
            
        except Exception as e:
            logger.error(f"Query failed: {table}.{operation} - {e}")
            raise DatabaseError(str(e), operation=f"{table}.{operation}")
    
    # ============================================================
    # Pagination Helper
    # ============================================================
    
    async def paginated_query(
        self,
        table: str,
        columns: str = "*",
        page_size: int = 1000,
        filters: Optional[Dict] = None,
        order_by: Optional[str] = None,
        order_desc: bool = False
    ) -> List[Dict]:
        """
        Execute paginated query to load all results.
        
        Args:
            table: Table name
            columns: Columns to select
            page_size: Records per page
            filters: Optional filters dict
            order_by: Column to order by
            order_desc: Descending order
        
        Returns:
            All matching records
        """
        all_data = []
        offset = 0
        
        while True:
            try:
                query = self.client.table(table).select(columns)
                
                if filters:
                    for key, value in filters.items():
                        if value is None:
                            query = query.is_(key, "null")
                        else:
                            query = query.eq(key, value)
                
                if order_by:
                    query = query.order(order_by, desc=order_desc)
                
                query = query.range(offset, offset + page_size - 1)
                response = query.execute()
                
                if not response.data:
                    break
                
                all_data.extend(response.data)
                
                if len(response.data) < page_size:
                    break
                
                offset += page_size
                logger.debug(f"Loaded {len(all_data)} records from {table}...")
                
            except Exception as e:
                logger.error(f"Paginated query failed: {table} - {e}")
                raise DatabaseError(str(e), operation=f"{table}.paginated_select")
        
        logger.info(f"Loaded {len(all_data)} total records from {table}")
        return all_data
    
    # ============================================================
    # Type Conversion Utilities
    # ============================================================
    
    @staticmethod
    def parse_bbox(bbox: Any) -> Dict:
        """Parse bounding box from DB format."""
        if isinstance(bbox, str):
            return json.loads(bbox)
        return bbox
    
    @staticmethod
    def descriptor_to_numpy(descriptor: Any) -> Optional[np.ndarray]:
        """Convert descriptor from DB to numpy array."""
        if descriptor is None:
            return None
        if isinstance(descriptor, list):
            return np.array(descriptor, dtype=np.float32)
        if isinstance(descriptor, str):
            return np.array(json.loads(descriptor), dtype=np.float32)
        return None
    
    @staticmethod
    def numpy_to_list(arr: np.ndarray) -> List[float]:
        """Convert numpy array to list for DB storage."""
        if isinstance(arr, np.ndarray):
            return arr.tolist()
        return arr
    
    @staticmethod
    def clean_for_json(data: Dict) -> Dict:
        """Clean dict values for JSON serialization."""
        result = {}
        for key, value in data.items():
            if isinstance(value, (np.integer, np.floating)):
                result[key] = float(value)
            elif isinstance(value, np.ndarray):
                result[key] = value.tolist()
            else:
                result[key] = value
        return result


# ============================================================
# Global Instance
# ============================================================

_supabase_client: Optional[SupabaseClient] = None

def get_supabase_client() -> SupabaseClient:
    """Get singleton Supabase client instance."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = SupabaseClient()
    return _supabase_client
