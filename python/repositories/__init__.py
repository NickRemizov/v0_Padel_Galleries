"""
Repositories package - data access layer.

Repositories handle all database operations.
No business logic - only queries and data transformation.

Usage:
    from repositories import FacesRepository
    
    repo = FacesRepository(supabase_client)
    faces = await repo.get_by_photo(photo_id)
"""

from repositories.base import BaseRepository
from repositories.faces_repo import FacesRepository
from repositories.people_repo import PeopleRepository
from repositories.galleries_repo import GalleriesRepository
from repositories.config_repo import ConfigRepository
from repositories.training_repo import TrainingRepository

__all__ = [
    'BaseRepository',
    'FacesRepository',
    'PeopleRepository',
    'GalleriesRepository',
    'ConfigRepository',
    'TrainingRepository',
]
