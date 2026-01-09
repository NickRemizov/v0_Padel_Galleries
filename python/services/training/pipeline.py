"""
Training Pipeline - Background training process.

v5.0: This module is deprecated. Training now uses database-based index
loaded from embeddings, not file-based index.
"""

import logging

logger = logging.getLogger(__name__)


async def run_training_pipeline(
    session_id: str,
    mode: str,
    filters: dict,
    options: dict,
    face_service,
    training_repo,
    progress_tracker: dict
):
    """
    Run training pipeline (deprecated).

    Training is now handled by rebuild_players_index() which loads
    embeddings directly from database.
    """
    logger.warning("[TrainingPipeline] This function is deprecated")
    logger.info(f"[TrainingPipeline] Session {session_id} - use rebuild_players_index() instead")

    # Just rebuild index from database
    try:
        result = await face_service.rebuild_players_index()
        logger.info(f"[TrainingPipeline] Index rebuilt: {result}")
    except Exception as e:
        logger.error(f"[TrainingPipeline] Error: {e}")
        raise
