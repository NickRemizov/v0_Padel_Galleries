-- Migration: Add excluded_from_index column to photo_faces
-- Date: 2025-12-20
-- Purpose: Allow excluding low-quality descriptors from HNSW index while keeping data

-- Add column with default FALSE (all existing descriptors remain in index)
ALTER TABLE photo_faces 
ADD COLUMN IF NOT EXISTS excluded_from_index BOOLEAN DEFAULT FALSE;

-- Add comment explaining the column
COMMENT ON COLUMN photo_faces.excluded_from_index IS 
'If TRUE, this descriptor is excluded from the HNSW recognition index. 
Used for outliers or low-confidence assignments. Data is preserved but not used for matching.';

-- Create partial index for efficient filtering (only index FALSE values since those are queried)
CREATE INDEX IF NOT EXISTS idx_photo_faces_not_excluded 
ON photo_faces(person_id) 
WHERE excluded_from_index = FALSE AND insightface_descriptor IS NOT NULL;

-- Optional: index for finding excluded faces per person (for UI display)
CREATE INDEX IF NOT EXISTS idx_photo_faces_excluded_by_person
ON photo_faces(person_id)
WHERE excluded_from_index = TRUE;
