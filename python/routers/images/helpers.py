"""
Images Helper Functions
"""


def get_supabase_db():
    """Get supabase_db instance from package globals."""
    from . import supabase_db_instance
    return supabase_db_instance


def get_face_service():
    """Get face_service instance from package globals."""
    from . import face_service_instance
    return face_service_instance
