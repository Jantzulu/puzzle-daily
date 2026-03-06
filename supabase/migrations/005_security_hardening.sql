-- ============================================================
-- Migration 005: Security Hardening - Proper RLS Policies
--
-- Replaces all permissive "USING (true)" policies with
-- proper role-based access:
--   - Draft tables: authenticated users only
--   - Live tables: public reads, authenticated writes
--   - Player tables: anonymous inserts, public reads
--   - Bug reports: anonymous inserts, authenticated management
--   - Storage: authenticated uploads, public reads
--   - Rate-limiting triggers on player submission tables
-- ============================================================


-- ============================================
-- 1. DRAFT TABLES (Dev-only: authenticated)
-- ============================================

-- puzzles_draft
DROP POLICY IF EXISTS "Allow all access to puzzles_draft" ON puzzles_draft;

CREATE POLICY "Authenticated users can read puzzles_draft"
  ON puzzles_draft FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert puzzles_draft"
  ON puzzles_draft FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update puzzles_draft"
  ON puzzles_draft FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete puzzles_draft"
  ON puzzles_draft FOR DELETE TO authenticated USING (true);

-- assets_draft
DROP POLICY IF EXISTS "Allow all access to assets_draft" ON assets_draft;

CREATE POLICY "Authenticated users can read assets_draft"
  ON assets_draft FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert assets_draft"
  ON assets_draft FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update assets_draft"
  ON assets_draft FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete assets_draft"
  ON assets_draft FOR DELETE TO authenticated USING (true);

-- asset_versions
DROP POLICY IF EXISTS "Allow all access to asset_versions" ON asset_versions;

CREATE POLICY "Authenticated users can read asset_versions"
  ON asset_versions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert asset_versions"
  ON asset_versions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update asset_versions"
  ON asset_versions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete asset_versions"
  ON asset_versions FOR DELETE TO authenticated USING (true);


-- ============================================
-- 2. LIVE TABLES (Public reads, auth writes)
-- ============================================

-- puzzles_live
DROP POLICY IF EXISTS "Allow read access to puzzles_live" ON puzzles_live;
DROP POLICY IF EXISTS "Allow insert to puzzles_live" ON puzzles_live;
DROP POLICY IF EXISTS "Allow update to puzzles_live" ON puzzles_live;
DROP POLICY IF EXISTS "Allow delete from puzzles_live" ON puzzles_live;

CREATE POLICY "Anyone can read puzzles_live"
  ON puzzles_live FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert puzzles_live"
  ON puzzles_live FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update puzzles_live"
  ON puzzles_live FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete puzzles_live"
  ON puzzles_live FOR DELETE TO authenticated USING (true);

-- assets_live
DROP POLICY IF EXISTS "Allow read access to assets_live" ON assets_live;
DROP POLICY IF EXISTS "Allow insert to assets_live" ON assets_live;
DROP POLICY IF EXISTS "Allow update to assets_live" ON assets_live;
DROP POLICY IF EXISTS "Allow delete from assets_live" ON assets_live;

CREATE POLICY "Anyone can read assets_live"
  ON assets_live FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert assets_live"
  ON assets_live FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update assets_live"
  ON assets_live FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete assets_live"
  ON assets_live FOR DELETE TO authenticated USING (true);

-- daily_schedule
DROP POLICY IF EXISTS "Allow read access to daily_schedule" ON daily_schedule;
DROP POLICY IF EXISTS "Allow insert to daily_schedule" ON daily_schedule;
DROP POLICY IF EXISTS "Allow update to daily_schedule" ON daily_schedule;
DROP POLICY IF EXISTS "Allow delete from daily_schedule" ON daily_schedule;

CREATE POLICY "Anyone can read daily_schedule"
  ON daily_schedule FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert daily_schedule"
  ON daily_schedule FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update daily_schedule"
  ON daily_schedule FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete daily_schedule"
  ON daily_schedule FOR DELETE TO authenticated USING (true);


-- ============================================
-- 3. PLAYER TABLES (puzzle_completions)
-- ============================================
-- Existing policies are already correct:
--   "Anyone can insert completions" FOR INSERT WITH CHECK (true)
--   "Anyone can read completions" FOR SELECT USING (true)
-- No UPDATE/DELETE — completions are immutable.


-- ============================================
-- 4. BUG REPORTS
-- ============================================

-- Ensure RLS is enabled
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Drop any existing wide-open policies
DROP POLICY IF EXISTS "Allow all access to bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "Anyone can insert bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "Anyone can read bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "Anyone can update bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "Anyone can delete bug_reports" ON bug_reports;

-- Anonymous players can submit bug reports
CREATE POLICY "Anyone can insert bug_reports"
  ON bug_reports FOR INSERT WITH CHECK (true);

-- Only authenticated devs can read and update bug reports
CREATE POLICY "Authenticated users can read bug_reports"
  ON bug_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update bug_reports"
  ON bug_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- ============================================
-- 5. STORAGE BUCKET POLICIES (theme-assets)
-- ============================================

-- Ensure bucket allows public URL access
UPDATE storage.buckets SET public = true WHERE id = 'theme-assets';

-- Drop any existing policies for this bucket
DROP POLICY IF EXISTS "Public read theme-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload theme-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update theme-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete theme-assets" ON storage.objects;

-- Public reads (anyone can load images)
CREATE POLICY "Public read theme-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'theme-assets');

-- Authenticated uploads only
CREATE POLICY "Authenticated upload theme-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'theme-assets');

-- Authenticated updates
CREATE POLICY "Authenticated update theme-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'theme-assets');

-- Authenticated deletes
CREATE POLICY "Authenticated delete theme-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'theme-assets');


-- ============================================
-- 6. RATE LIMITING TRIGGERS
-- ============================================

-- Prevent duplicate completions: one per player+puzzle per 10 seconds
CREATE OR REPLACE FUNCTION check_completion_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM puzzle_completions
    WHERE player_id = NEW.player_id
      AND puzzle_id = NEW.puzzle_id
      AND created_at > NOW() - INTERVAL '10 seconds'
  ) THEN
    RAISE EXCEPTION 'Rate limit: duplicate completion too soon';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS completion_rate_limit ON puzzle_completions;
CREATE TRIGGER completion_rate_limit
  BEFORE INSERT ON puzzle_completions
  FOR EACH ROW EXECUTE FUNCTION check_completion_rate_limit();

-- Prevent bug report spam: one per player per 60 seconds
CREATE OR REPLACE FUNCTION check_bug_report_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bug_reports
    WHERE player_id = NEW.player_id
      AND created_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Rate limit: too many bug reports';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bug_report_rate_limit ON bug_reports;
CREATE TRIGGER bug_report_rate_limit
  BEFORE INSERT ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION check_bug_report_rate_limit();
