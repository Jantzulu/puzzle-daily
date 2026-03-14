-- Bug reports table for player-submitted bug reports
CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  puzzle_id TEXT NOT NULL,
  puzzle_name TEXT,
  placements JSONB NOT NULL DEFAULT '[]',
  outcome TEXT NOT NULL DEFAULT 'defeat',
  turns_used INTEGER DEFAULT 0,
  asset_type TEXT,
  asset_id TEXT,
  asset_name TEXT,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  dev_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Policies (replaces those in 005 if table didn't exist before)
DROP POLICY IF EXISTS "Anyone can insert bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "Authenticated users can read bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "Authenticated users can update bug_reports" ON bug_reports;

-- Anyone (including anonymous/unauthenticated) can submit bug reports
CREATE POLICY "Anyone can insert bug_reports"
  ON bug_reports FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only authenticated devs can read and manage bug reports
CREATE POLICY "Authenticated users can read bug_reports"
  ON bug_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update bug_reports"
  ON bug_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bug_reports_puzzle ON bug_reports(puzzle_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);
