"""
Repositories package - data access layer.

Repositories handle all database operations.
No business logic - only queries and data transformation.

Usage:
    from repositories import PeopleRepository

    repo = PeopleRepository(supabase_client)
    people = await repo.get_all()
"""

from repositories.base import BaseRepository
from repositories.people_repo import PeopleRepository
from repositories.galleries_repo import GalleriesRepository
from repositories.config_repo import ConfigRepository

__all__ = [
    'BaseRepository',
    'PeopleRepository',
    'GalleriesRepository',
    'ConfigRepository',
]
