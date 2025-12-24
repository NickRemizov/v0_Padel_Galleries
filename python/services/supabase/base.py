"""
Supabase Base Client - Single connection point for all Supabase operations.

All repositories use this shared client to avoid multiple connections.
"""

import os
from supabase import create_client, Client

from core.logging import get_logger

logger = get_logger(__name__)


class SupabaseBase:
    """
    Base Supabase client - singleton pattern.
    Provides shared connection for all repositories.
    """
    
    _instance = None
    _client: Client = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is not None:
            return
        
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self._client = create_client(supabase_url, supabase_key)
        logger.info("SupabaseBase initialized (singleton)")
    
    @property
    def client(self) -> Client:
        """Get Supabase client instance."""
        return self._client


# Global instance for easy access
_base_instance: SupabaseBase = None


def get_supabase_client() -> Client:
    """Get shared Supabase client instance."""
    global _base_instance
    if _base_instance is None:
        _base_instance = SupabaseBase()
    return _base_instance.client


def get_supabase_base() -> SupabaseBase:
    """Get SupabaseBase instance."""
    global _base_instance
    if _base_instance is None:
        _base_instance = SupabaseBase()
    return _base_instance
