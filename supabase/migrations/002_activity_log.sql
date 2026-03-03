-- Activity Log table for tracking who did what and when
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,  -- create, update, delete, publish, sync_push, sync_pull
  asset_type TEXT,       -- puzzle, tile_type, enemy, character, object, skin, spell, etc.
  asset_id TEXT,
  asset_name TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_asset ON activity_log (asset_type, asset_id);

-- RLS: authenticated users can read and insert
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read activity" ON activity_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert activity" ON activity_log
  FOR INSERT TO authenticated WITH CHECK (true);
