"""
Infrastructure package - external dependencies and integrations.

Modules:
- supabase.py - Unified Supabase client
- storage.py - File storage operations
"""

from infrastructure.supabase import SupabaseClient, get_supabase_client

__all__ = [
    'SupabaseClient',
    'get_supabase_client',
]
