-- Puzzle Daily Database Schema
-- Run this in Supabase SQL Editor (SQL Editor tab in dashboard)

-- ============================================
-- DRAFT/STAGING TABLES (Dev Tool)
-- ============================================

-- Puzzles (draft/staging)
CREATE TABLE puzzles_draft (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'published')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  scheduled_date DATE
);

-- Assets (tile types, enemies, characters, objects, skins, spells)
CREATE TABLE assets_draft (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('tile_type', 'enemy', 'character', 'object', 'skin', 'spell')),
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- ============================================
-- PRODUCTION TABLES (Player App)
-- ============================================

-- Published puzzles (player-facing)
CREATE TABLE puzzles_live (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_date DATE,
  is_daily BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE
);

-- Published assets (only those used by live puzzles)
CREATE TABLE assets_live (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('tile_type', 'enemy', 'character', 'object', 'skin', 'spell')),
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  published_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily puzzle schedule
CREATE TABLE daily_schedule (
  id SERIAL PRIMARY KEY,
  puzzle_id TEXT REFERENCES puzzles_live(id),
  scheduled_date DATE UNIQUE NOT NULL,
  puzzle_number INTEGER UNIQUE,  -- Sequential puzzle number (Puzzle #1, #2, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_puzzles_draft_status ON puzzles_draft(status);
CREATE INDEX idx_puzzles_draft_updated ON puzzles_draft(updated_at DESC);
CREATE INDEX idx_assets_draft_type ON assets_draft(type);
CREATE INDEX idx_assets_draft_status ON assets_draft(status);
CREATE INDEX idx_puzzles_live_daily ON puzzles_live(is_daily);
CREATE INDEX idx_puzzles_live_scheduled ON puzzles_live(scheduled_date);
CREATE INDEX idx_daily_schedule_date ON daily_schedule(scheduled_date);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER puzzles_draft_updated_at
  BEFORE UPDATE ON puzzles_draft
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER assets_draft_updated_at
  BEFORE UPDATE ON assets_draft
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE puzzles_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzles_live ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets_live ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_schedule ENABLE ROW LEVEL SECURITY;

-- Dev tool policies (allow all for now - can add auth later)
-- For development, we'll allow public access to draft tables
CREATE POLICY "Allow all access to puzzles_draft" ON puzzles_draft
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to assets_draft" ON assets_draft
  FOR ALL USING (true) WITH CHECK (true);

-- Player app policies (read-only for live tables)
CREATE POLICY "Allow read access to puzzles_live" ON puzzles_live
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to assets_live" ON assets_live
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to daily_schedule" ON daily_schedule
  FOR SELECT USING (true);

-- Allow dev tool to write to live tables (for publishing)
CREATE POLICY "Allow insert to puzzles_live" ON puzzles_live
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow insert to assets_live" ON assets_live
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow insert to daily_schedule" ON daily_schedule
  FOR INSERT WITH CHECK (true);

-- Allow dev tool to update/delete live tables (for unpublish & re-publish)
CREATE POLICY "Allow update to puzzles_live" ON puzzles_live
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete from puzzles_live" ON puzzles_live
  FOR DELETE USING (true);

CREATE POLICY "Allow update to assets_live" ON assets_live
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete from assets_live" ON assets_live
  FOR DELETE USING (true);

CREATE POLICY "Allow update to daily_schedule" ON daily_schedule
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete from daily_schedule" ON daily_schedule
  FOR DELETE USING (true);

-- ============================================
-- VERSION HISTORY
-- ============================================

-- Manual version snapshots for puzzles and assets
CREATE TABLE asset_versions (
  id SERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,  -- 'puzzle', 'tile_type', 'enemy', 'character', 'object', 'skin', 'spell', etc.
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE UNIQUE INDEX idx_asset_versions_unique ON asset_versions(asset_id, version_number);
CREATE INDEX idx_asset_versions_asset ON asset_versions(asset_id, version_number DESC);

ALTER TABLE asset_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to asset_versions" ON asset_versions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- PUZZLE COMPLETIONS (Statistics & Analytics)
-- ============================================

-- Stores victory AND defeat records for all players
CREATE TABLE puzzle_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  puzzle_id TEXT NOT NULL,
  puzzle_date DATE,
  outcome TEXT NOT NULL CHECK (outcome IN ('victory', 'defeat')),
  rank TEXT CHECK (rank IN ('bronze', 'silver', 'gold')),
  total_points INTEGER,
  base_points INTEGER,
  character_bonus INTEGER,
  turn_bonus INTEGER,
  lives_bonus INTEGER,
  side_quest_points INTEGER,
  completed_side_quests TEXT[] DEFAULT '{}',
  par_met_characters BOOLEAN,
  par_met_turns BOOLEAN,
  characters_used INTEGER NOT NULL,
  character_ids TEXT[] NOT NULL DEFAULT '{}',
  turns_used INTEGER NOT NULL,
  lives_remaining INTEGER,
  defeat_reason TEXT CHECK (defeat_reason IN ('damage', 'turns', 'concede')),
  defeat_turn INTEGER,
  attempt_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_completions_puzzle_id ON puzzle_completions(puzzle_id);
CREATE INDEX idx_completions_puzzle_date ON puzzle_completions(puzzle_date);
CREATE INDEX idx_completions_player_id ON puzzle_completions(player_id);
CREATE INDEX idx_completions_outcome ON puzzle_completions(outcome);
CREATE INDEX idx_completions_created_at ON puzzle_completions(created_at DESC);
CREATE INDEX idx_completions_puzzle_outcome ON puzzle_completions(puzzle_id, outcome);

ALTER TABLE puzzle_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert completions" ON puzzle_completions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read completions" ON puzzle_completions
  FOR SELECT USING (true);

-- ============================================
-- STORAGE BUCKET FOR IMAGES (optional - for large sprites)
-- ============================================

-- Run this separately in Storage section or via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('sprites', 'sprites', true);
