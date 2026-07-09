-- ============================================================
-- Migration 011: Server-validated completions
-- puzzle_completions may now only be written by the submit-completion
-- Edge Function (service-role key, which bypasses RLS). Direct client
-- inserts with the anon/authenticated key are removed so a fabricated
-- score can no longer be POSTed straight to the table.
--
-- Reads stay public (community stats query the table directly), and the
-- rate-limit trigger (migration 010) still fires on the function's insert.
-- ============================================================

-- Remove the open INSERT policy from migration 004.
DROP POLICY IF EXISTS "Anyone can insert completions" ON puzzle_completions;

-- No replacement INSERT policy is created: with RLS enabled and no INSERT
-- policy, anon/authenticated inserts are denied. The Edge Function uses the
-- service-role key, which bypasses RLS entirely, so it remains the sole
-- writer. The public SELECT policy from migration 004 is left untouched.
