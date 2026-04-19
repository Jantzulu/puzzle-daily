-- ============================================================
-- Migration 010: Silence the Completion Rate-Limit Trigger
--
-- Migration 005 added a trigger that RAISE EXCEPTIONs when the
-- same (player_id, puzzle_id) inserts a completion within 10s.
-- That maps to HTTP 400 (P0001) on the client, which legitimately
-- fires whenever a player fails fast, retries, and fails again
-- in under 10 seconds.
--
-- The goal of the trigger was anti-spam, not rejecting fast
-- retries. Switch it to silently drop the duplicate row
-- (RETURN NULL) so the client sees a 201 with no row inserted
-- instead of a 400 it has to swallow.
-- ============================================================

CREATE OR REPLACE FUNCTION check_completion_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM puzzle_completions
    WHERE player_id = NEW.player_id
      AND puzzle_id = NEW.puzzle_id
      AND created_at > NOW() - INTERVAL '10 seconds'
  ) THEN
    -- Silently skip the duplicate. Cancels the INSERT without
    -- raising, so PostgREST returns 201 and the client treats
    -- this as a successful no-op.
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
