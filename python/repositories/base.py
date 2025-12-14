"""
Base repository with common functionality.
"""

from typing import Optional, List, Dict, Any, TypeVar, Generic
from pydantic import BaseModel

from core.exceptions import DatabaseError, NotFoundError
from core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar('T', bound=BaseModel)


class BaseRepository(Generic[T]):
    """
    Base repository providing common database operations.
    
    Subclasses should:
    - Set `table_name` class attribute
    - Set `model_class` class attribute
    - Implement domain-specific methods
    """
    
    table_name: str = None
    model_class: type = None
    
    def __init__(self, supabase_client):
        """
        Initialize repository.
        
        Args:
            supabase_client: SupabaseClient instance (from infrastructure/)
        """
        self.client = supabase_client
        self.logger = get_logger(f"repo.{self.__class__.__name__}")
    
    @property
    def table(self):
        """Get table reference for queries."""
        return self.client.client.table(self.table_name)
    
    # ============================================================
    # Generic CRUD Operations
    # ============================================================
    
    async def get_by_id(self, id: str) -> Optional[T]:
        """
        Get single record by ID.
        
        Args:
            id: Record ID
        
        Returns:
            Model instance or None
        """
        try:
            response = self.table.select("*").eq("id", id).execute()
            
            if not response.data:
                return None
            
            return self._to_model(response.data[0])
            
        except Exception as e:
            self._handle_error("get_by_id", e)
    
    async def get_by_id_or_raise(self, id: str, entity_name: str = None) -> T:
        """
        Get single record by ID or raise NotFoundError.
        """
        result = await self.get_by_id(id)
        if result is None:
            entity = entity_name or self.table_name.rstrip('s').title()
            raise NotFoundError(entity, id)
        return result
    
    async def get_all(
        self,
        limit: int = 100,
        offset: int = 0,
        order_by: str = "created_at",
        order_desc: bool = True
    ) -> List[T]:
        """
        Get all records with pagination.
        """
        try:
            query = self.table.select("*")
            query = query.order(order_by, desc=order_desc)
            query = query.range(offset, offset + limit - 1)
            
            response = query.execute()
            return [self._to_model(row) for row in response.data]
            
        except Exception as e:
            self._handle_error("get_all", e)
    
    async def count(self, filters: Dict[str, Any] = None) -> int:
        """
        Count records matching filters.
        """
        try:
            query = self.table.select("id", count="exact")
            
            if filters:
                for key, value in filters.items():
                    if value is None:
                        query = query.is_(key, "null")
                    else:
                        query = query.eq(key, value)
            
            response = query.execute()
            return response.count or 0
            
        except Exception as e:
            self._handle_error("count", e)
    
    async def create(self, data: Dict[str, Any]) -> T:
        """
        Create new record.
        """
        try:
            # Clean data for JSON serialization
            clean_data = self.client.clean_for_json(data)
            
            response = self.table.insert(clean_data).execute()
            
            if not response.data:
                raise DatabaseError("Insert returned no data")
            
            return self._to_model(response.data[0])
            
        except Exception as e:
            self._handle_error("create", e)
    
    async def update(self, id: str, data: Dict[str, Any]) -> T:
        """
        Update existing record.
        """
        try:
            clean_data = self.client.clean_for_json(data)
            
            response = self.table.update(clean_data).eq("id", id).execute()
            
            if not response.data:
                raise NotFoundError(self.table_name.rstrip('s').title(), id)
            
            return self._to_model(response.data[0])
            
        except NotFoundError:
            raise
        except Exception as e:
            self._handle_error("update", e)
    
    async def delete(self, id: str) -> bool:
        """
        Delete record by ID.
        """
        try:
            response = self.table.delete().eq("id", id).execute()
            return len(response.data) > 0
            
        except Exception as e:
            self._handle_error("delete", e)
    
    # ============================================================
    # Helper Methods
    # ============================================================
    
    def _to_model(self, data: Dict) -> T:
        """
        Convert database row to model instance.
        Override in subclasses for custom transformation.
        """
        if self.model_class is None:
            return data
        return self.model_class(**data)
    
    def _handle_error(self, operation: str, error: Exception):
        """
        Handle database error with logging.
        """
        self.logger.error(f"{operation} failed: {error}")
        raise DatabaseError(str(error), operation=f"{self.table_name}.{operation}")
