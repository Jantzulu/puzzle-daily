-- ============================================================
-- Migration 009: Creator Delete Completions
-- Allows authenticated creators to delete puzzle_completions
-- records for analytics reset before puzzles go live.
-- ============================================================

-- Allow authenticated creators to delete completion records
CREATE POLICY "Creators can delete completions"
  ON puzzle_completions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'creator'
    )
  );
