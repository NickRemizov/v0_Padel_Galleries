-- Create selfie_searches table for selfie-based registration
CREATE TABLE IF NOT EXISTS selfie_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    descriptor VECTOR(512),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'no_match', 'collision')),
    matched_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
    matches_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_selfie_searches_user_id ON selfie_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_selfie_searches_status ON selfie_searches(status);

COMMENT ON TABLE selfie_searches IS 'Stores selfie images uploaded by users for face-based photo search';
COMMENT ON COLUMN selfie_searches.status IS 'pending=searching, matched=found and confirmed, no_match=not found, collision=matched existing person';
