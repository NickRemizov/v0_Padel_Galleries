-- Admin activity log for tracking user events
-- Events: registrations, account linking, name changes, privacy settings changes

CREATE TABLE IF NOT EXISTS admin_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,  -- 'user_registered', 'user_linked', 'name_changed', 'privacy_changed'
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  metadata JSONB,  -- {old_value, new_value, telegram_username, setting_name, ...}
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_created_at ON admin_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_event_type ON admin_activity(event_type);

COMMENT ON TABLE admin_activity IS 'Admin activity log for user events';
COMMENT ON COLUMN admin_activity.event_type IS 'user_registered, user_linked, name_changed, privacy_changed';
COMMENT ON COLUMN admin_activity.metadata IS 'JSON with event details: old_value, new_value, telegram_username, etc.';
