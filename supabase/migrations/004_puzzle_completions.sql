-- ============================================================
-- Migration 004: Puzzle Completions (Statistics & Analytics)
-- Stores victory AND defeat records for all players.
-- Anonymous players identified by a client-generated player_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS puzzle_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who played
  player_id TEXT NOT NULL,                                        -- localStorage UUID for anonymous players
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,      -- optional, for authenticated users

  -- What puzzle
  puzzle_id TEXT NOT NULL,
  puzzle_date DATE,                                               -- scheduled date (if daily puzzle)

  -- Outcome
  outcome TEXT NOT NULL CHECK (outcome IN ('victory', 'defeat')),

  -- Victory data (null for defeats)
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

  -- Performance stats (both victory and defeat)
  characters_used INTEGER NOT NULL,
  character_ids TEXT[] NOT NULL DEFAULT '{}',
  turns_used INTEGER NOT NULL,
  lives_remaining INTEGER,

  -- Defeat-specific data
  defeat_reason TEXT CHECK (defeat_reason IN ('damage', 'turns', 'concede')),
  defeat_turn INTEGER,

  -- Timing
  attempt_duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_completions_puzzle_id ON puzzle_completions(puzzle_id);
CREATE INDEX idx_completions_puzzle_date ON puzzle_completions(puzzle_date);
CREATE INDEX idx_completions_player_id ON puzzle_completions(player_id);
CREATE INDEX idx_completions_outcome ON puzzle_completions(outcome);
CREATE INDEX idx_completions_created_at ON puzzle_completions(created_at DESC);
CREATE INDEX idx_completions_puzzle_outcome ON puzzle_completions(puzzle_id, outcome);

-- RLS
ALTER TABLE puzzle_completions ENABLE ROW LEVEL SECURITY;

-- Anyone can insert completions (anonymous players use anon key)
CREATE POLICY "Anyone can insert completions"
  ON puzzle_completions FOR INSERT WITH CHECK (true);

-- Anyone can read completions (needed for community stats on the play page)
CREATE POLICY "Anyone can read completions"
  ON puzzle_completions FOR SELECT USING (true);
