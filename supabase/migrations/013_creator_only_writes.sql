-- ============================================================
-- Migration 013: Creator-Only Writes
--
-- Closes the gap between 005 (writes require "authenticated")
-- and 007 (creator/player roles): public signup creates
-- 'player' accounts, but every content-table write policy
-- accepted ANY authenticated user. A self-signed-up player
-- could call the REST API directly and modify/delete puzzles,
-- assets, the daily schedule, and storage files.
--
-- After this migration:
--   - Draft tables + asset_versions: creator-only (all ops)
--   - Live tables: public reads, creator-only writes
--   - bug_reports: public inserts, creator-only read/manage
--   - storage.objects: creator-only list + writes; public
--     image serving is unaffected (the bucket stays public,
--     which serves objects without any SELECT policy — this
--     also resolves the "Clients can list all files in this
--     bucket" linter warning)
--   - profiles.role: changeable from the dashboard/service
--     role again (007's trigger blocked everyone, making it
--     impossible to promote a new team member)
-- ============================================================


-- ============================================
-- 0. HELPER: is_creator()
-- ============================================
-- SECURITY DEFINER so the profiles lookup is not subject to
-- profiles' own RLS when evaluated inside other policies.

CREATE OR REPLACE FUNCTION is_creator()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'creator'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;


-- ============================================
-- 1. DRAFT TABLES (creator-only, all operations)
-- ============================================

-- puzzles_draft
DROP POLICY IF EXISTS "Authenticated users can read puzzles_draft" ON puzzles_draft;
DROP POLICY IF EXISTS "Authenticated users can insert puzzles_draft" ON puzzles_draft;
DROP POLICY IF EXISTS "Authenticated users can update puzzles_draft" ON puzzles_draft;
DROP POLICY IF EXISTS "Authenticated users can delete puzzles_draft" ON puzzles_draft;

CREATE POLICY "Creators can read puzzles_draft"
  ON puzzles_draft FOR SELECT TO authenticated USING (is_creator());

CREATE POLICY "Creators can insert puzzles_draft"
  ON puzzles_draft FOR INSERT TO authenticated WITH CHECK (is_creator());

CREATE POLICY "Creators can update puzzles_draft"
  ON puzzles_draft FOR UPDATE TO authenticated USING (is_creator()) WITH CHECK (is_creator());

CREATE POLICY "Creators can delete puzzles_draft"
  ON puzzles_draft FOR DELETE TO authenticated USING (is_creator());

-- assets_draft
DROP POLICY IF EXISTS "Authenticated users can read assets_draft" ON assets_draft;
DROP POLICY IF EXISTS "Authenticated users can insert assets_draft" ON assets_draft;
DROP POLICY IF EXISTS "Authenticated users can update assets_draft" ON assets_draft;
DROP POLICY IF EXISTS "Authenticated users can delete assets_draft" ON assets_draft;

CREATE POLICY "Creators can read assets_draft"
  ON assets_draft FOR SELECT TO authenticated USING (is_creator());

CREATE POLICY "Creators can insert assets_draft"
  ON assets_draft FOR INSERT TO authenticated WITH CHECK (is_creator());

CREATE POLICY "Creators can update assets_draft"
  ON assets_draft FOR UPDATE TO authenticated USING (is_creator()) WITH CHECK (is_creator());

CREATE POLICY "Creators can delete assets_draft"
  ON assets_draft FOR DELETE TO authenticated USING (is_creator());

-- asset_versions
DROP POLICY IF EXISTS "Authenticated users can read asset_versions" ON asset_versions;
DROP POLICY IF EXISTS "Authenticated users can insert asset_versions" ON asset_versions;
DROP POLICY IF EXISTS "Authenticated users can update asset_versions" ON asset_versions;
DROP POLICY IF EXISTS "Authenticated users can delete asset_versions" ON asset_versions;

CREATE POLICY "Creators can read asset_versions"
  ON asset_versions FOR SELECT TO authenticated USING (is_creator());

CREATE POLICY "Creators can insert asset_versions"
  ON asset_versions FOR INSERT TO authenticated WITH CHECK (is_creator());

CREATE POLICY "Creators can update asset_versions"
  ON asset_versions FOR UPDATE TO authenticated USING (is_creator()) WITH CHECK (is_creator());

CREATE POLICY "Creators can delete asset_versions"
  ON asset_versions FOR DELETE TO authenticated USING (is_creator());


-- ============================================
-- 2. LIVE TABLES (public reads unchanged, creator-only writes)
-- ============================================

-- puzzles_live
DROP POLICY IF EXISTS "Authenticated users can insert puzzles_live" ON puzzles_live;
DROP POLICY IF EXISTS "Authenticated users can update puzzles_live" ON puzzles_live;
DROP POLICY IF EXISTS "Authenticated users can delete puzzles_live" ON puzzles_live;

CREATE POLICY "Creators can insert puzzles_live"
  ON puzzles_live FOR INSERT TO authenticated WITH CHECK (is_creator());

CREATE POLICY "Creators can update puzzles_live"
  ON puzzles_live FOR UPDATE TO authenticated USING (is_creator()) WITH CHECK (is_creator());

CREATE POLICY "Creators can delete puzzles_live"
  ON puzzles_live FOR DELETE TO authenticated USING (is_creator());

-- assets_live
DROP POLICY IF EXISTS "Authenticated users can insert assets_live" ON assets_live;
DROP POLICY IF EXISTS "Authenticated users can update assets_live" ON assets_live;
DROP POLICY IF EXISTS "Authenticated users can delete assets_live" ON assets_live;

CREATE POLICY "Creators can insert assets_live"
  ON assets_live FOR INSERT TO authenticated WITH CHECK (is_creator());

CREATE POLICY "Creators can update assets_live"
  ON assets_live FOR UPDATE TO authenticated USING (is_creator()) WITH CHECK (is_creator());

CREATE POLICY "Creators can delete assets_live"
  ON assets_live FOR DELETE TO authenticated USING (is_creator());

-- daily_schedule
DROP POLICY IF EXISTS "Authenticated users can insert daily_schedule" ON daily_schedule;
DROP POLICY IF EXISTS "Authenticated users can update daily_schedule" ON daily_schedule;
DROP POLICY IF EXISTS "Authenticated users can delete daily_schedule" ON daily_schedule;

CREATE POLICY "Creators can insert daily_schedule"
  ON daily_schedule FOR INSERT TO authenticated WITH CHECK (is_creator());

CREATE POLICY "Creators can update daily_schedule"
  ON daily_schedule FOR UPDATE TO authenticated USING (is_creator()) WITH CHECK (is_creator());

CREATE POLICY "Creators can delete daily_schedule"
  ON daily_schedule FOR DELETE TO authenticated USING (is_creator());


-- ============================================
-- 3. BUG REPORTS (public inserts unchanged, creator-only management)
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can read bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "Authenticated users can update bug_reports" ON bug_reports;

CREATE POLICY "Creators can read bug_reports"
  ON bug_reports FOR SELECT TO authenticated USING (is_creator());

CREATE POLICY "Creators can update bug_reports"
  ON bug_reports FOR UPDATE TO authenticated USING (is_creator()) WITH CHECK (is_creator());


-- ============================================
-- 4. STORAGE (theme-assets)
-- ============================================
-- The bucket stays public: objects are served through the
-- /object/public/ endpoint, which does not consult SELECT
-- policies. SELECT policies on storage.objects only control
-- the LIST API — dropping the public ones closes the
-- "clients can list all files" hole while player image
-- loading keeps working. Creators keep list access for the
-- editor's media browser.
--
-- Drop ALL existing policies on storage.objects (including
-- any created ad-hoc through the dashboard UI) and recreate
-- a clean creator-only set.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Creators can list theme-assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'theme-assets' AND is_creator());

CREATE POLICY "Creators can upload theme-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'theme-assets' AND is_creator());

CREATE POLICY "Creators can update theme-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'theme-assets' AND is_creator());

CREATE POLICY "Creators can delete theme-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'theme-assets' AND is_creator());


-- ============================================
-- 5. ALLOW ROLE PROMOTION FROM DASHBOARD
-- ============================================
-- 007's trigger forced NEW.role = OLD.role for EVERY update,
-- including ones run as postgres in the SQL editor — so no
-- one could ever be promoted to creator. Client requests
-- always carry auth.uid(); dashboard/service-role contexts
-- don't. Gate on that instead.

CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.role = OLD.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
