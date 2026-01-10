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

-- ============================================
-- STORAGE BUCKET FOR IMAGES (optional - for large sprites)
-- ============================================

-- Run this separately in Storage section or via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('sprites', 'sprites', true);
