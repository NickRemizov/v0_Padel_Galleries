"""
Training Session Management

Functions for creating, updating, and querying training sessions.
"""

import uuid
from typing import Dict, Optional
from datetime import datetime, timedelta

import logging

logger = logging.getLogger(__name__)


def create_session(
    training_repo,
    mode: str,
    options: Dict
) -> str:
    """
    Create a new training session.
    
    Args:
        training_repo: Training repository instance
        mode: Training mode ('full' or 'incremental')
        options: Training options dict
    
    Returns:
        session_id: UUID of created session
    """
    session_id = str(uuid.uuid4())
    session_data = {
        'id': session_id,
        'model_version': options.get('model_version', 'v1.0'),
        'training_mode': mode,
        'faces_count': 0,
        'people_count': 0,
        'context_weight': options['context_weight'],
        'min_faces_per_person': options['min_faces_per_person'],
        'metrics': {},
        'status': 'running'
    }
    
    training_repo.create_training_session(session_data)
    logger.info(f"[TrainingSession] Created session: {session_id}")
    
    return session_id


def update_session_completed(
    training_repo,
    session_id: str,
    faces_count: int,
    people_count: int,
    metrics: Dict
):
    """
    Update session as completed with results.
    """
    updates = {
        'faces_count': faces_count,
        'people_count': people_count,
        'metrics': metrics,
        'status': 'completed'
    }
    training_repo.update_training_session(session_id, updates)
    logger.info(f"[TrainingSession] Session {session_id} completed")


def update_session_failed(training_repo, session_id: str, error: str):
    """
    Update session as failed with error.
    """
    training_repo.update_training_session(session_id, {
        'status': 'failed',
        'metrics': {'error': error}
    })
    logger.error(f"[TrainingSession] Session {session_id} failed: {error}")


def get_status(
    training_repo,
    session_id: str,
    current_session_id: Optional[str],
    current_progress: Dict
) -> Dict:
    """
    Get training status by session ID.
    
    Args:
        training_repo: Training repository instance
        session_id: Session ID to query
        current_session_id: Currently running session ID (if any)
        current_progress: Current progress dict for running session
    
    Returns:
        Status dict with session info and progress
    """
    session = training_repo.get_training_session(session_id)
    if not session:
        return {'error': 'Session not found'}
    
    result = {
        'session_id': session_id,
        'status': session['status'],
        'started_at': session['created_at']
    }
    
    if session_id == current_session_id and session['status'] == 'running':
        result['progress'] = {
            'current': current_progress['current'],
            'total': current_progress['total'],
            'percentage': int(
                (current_progress['current'] / current_progress['total'] * 100)
                if current_progress['total'] > 0 else 0
            )
        }
        result['current_step'] = current_progress['step']
        
        # Estimate completion time
        if current_progress['current'] > 0:
            try:
                elapsed = (datetime.now() - datetime.fromisoformat(session['created_at'])).total_seconds()
                avg_time = elapsed / current_progress['current']
                remaining = current_progress['total'] - current_progress['current']
                estimated = datetime.now() + timedelta(seconds=remaining * avg_time)
                result['estimated_completion'] = estimated.isoformat()
            except:
                pass
    
    return result


def get_history(training_repo, limit: int = 10, offset: int = 0) -> Dict:
    """
    Get training history from database.
    
    Returns:
        Dict with 'sessions' list and 'total' count
    """
    try:
        sessions = training_repo.get_training_history(limit, offset)
        total = training_repo.get_training_sessions_count()
        
        return {
            'sessions': sessions,
            'total': total
        }
    except Exception as e:
        logger.error(f"Error getting training history: {e}")
        return {'sessions': [], 'total': 0}
