-- ============================================================
-- Migration 008: Player-Facing Input Validation
--
-- Adds CHECK constraints to the two publicly writable tables
-- (puzzle_completions, bug_reports) to reject malicious or
-- garbage data at the database level.
--
-- Uses NOT VALID so existing rows aren't checked (safe to run
-- even if legacy data has edge-case values), then VALIDATE
-- CONSTRAINT to enable full enforcement going forward.
-- ============================================================


-- ============================================
-- 1. PUZZLE_COMPLETIONS — Numeric Ranges
-- ============================================

-- Characters used: 0–20 (reasonable hero cap)
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_characters_used
  CHECK (characters_used >= 0 AND characters_used <= 20) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_characters_used;

-- Turns used: 0–200
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_turns_used
  CHECK (turns_used >= 0 AND turns_used <= 200) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_turns_used;

-- Lives remaining: 0–10
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_lives_remaining
  CHECK (lives_remaining IS NULL OR (lives_remaining >= 0 AND lives_remaining <= 10)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_lives_remaining;

-- Total points: 0–100,000
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_total_points
  CHECK (total_points IS NULL OR (total_points >= 0 AND total_points <= 100000)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_total_points;

-- Base points: 0–50,000
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_base_points
  CHECK (base_points IS NULL OR (base_points >= 0 AND base_points <= 50000)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_base_points;

-- Character bonus: 0–50,000
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_character_bonus
  CHECK (character_bonus IS NULL OR (character_bonus >= 0 AND character_bonus <= 50000)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_character_bonus;

-- Turn bonus: 0–50,000
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_turn_bonus
  CHECK (turn_bonus IS NULL OR (turn_bonus >= 0 AND turn_bonus <= 50000)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_turn_bonus;

-- Lives bonus: 0–50,000
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_lives_bonus
  CHECK (lives_bonus IS NULL OR (lives_bonus >= 0 AND lives_bonus <= 50000)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_lives_bonus;

-- Side quest points: 0–50,000
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_side_quest_points
  CHECK (side_quest_points IS NULL OR (side_quest_points >= 0 AND side_quest_points <= 50000)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_side_quest_points;

-- Defeat turn: 0–200
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_defeat_turn
  CHECK (defeat_turn IS NULL OR (defeat_turn >= 0 AND defeat_turn <= 200)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_defeat_turn;

-- Attempt duration: 0–3,600,000ms (max 1 hour)
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_attempt_duration
  CHECK (attempt_duration_ms IS NULL OR (attempt_duration_ms >= 0 AND attempt_duration_ms <= 3600000)) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_attempt_duration;


-- ============================================
-- 2. PUZZLE_COMPLETIONS — Array Size Limits
-- ============================================

-- Character IDs array: max 20 entries
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_character_ids_length
  CHECK (array_length(character_ids, 1) IS NULL OR array_length(character_ids, 1) <= 20) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_character_ids_length;

-- Completed side quests array: max 20 entries
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_side_quests_length
  CHECK (array_length(completed_side_quests, 1) IS NULL OR array_length(completed_side_quests, 1) <= 20) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_side_quests_length;


-- ============================================
-- 3. PUZZLE_COMPLETIONS — String Length Limits
-- ============================================

-- Player ID: max 100 chars (UUIDs are 36 chars)
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_player_id_length
  CHECK (char_length(player_id) <= 100) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_player_id_length;

-- Puzzle ID: max 100 chars
ALTER TABLE puzzle_completions
  ADD CONSTRAINT chk_puzzle_id_length
  CHECK (char_length(puzzle_id) <= 100) NOT VALID;
ALTER TABLE puzzle_completions VALIDATE CONSTRAINT chk_puzzle_id_length;


-- ============================================
-- 4. BUG_REPORTS — String Length Limits
-- ============================================

-- Player ID: max 100 chars
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_player_id_length
  CHECK (char_length(player_id) <= 100) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_player_id_length;

-- Puzzle ID: max 100 chars
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_puzzle_id_length
  CHECK (char_length(puzzle_id) <= 100) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_puzzle_id_length;

-- Puzzle name: max 200 chars
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_puzzle_name_length
  CHECK (puzzle_name IS NULL OR char_length(puzzle_name) <= 200) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_puzzle_name_length;

-- Description: max 5,000 chars
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_description_length
  CHECK (char_length(description) <= 5000) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_description_length;

-- Asset type: max 50 chars
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_asset_type_length
  CHECK (asset_type IS NULL OR char_length(asset_type) <= 50) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_asset_type_length;

-- Asset ID: max 100 chars
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_asset_id_length
  CHECK (asset_id IS NULL OR char_length(asset_id) <= 100) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_asset_id_length;

-- Asset name: max 200 chars
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_asset_name_length
  CHECK (asset_name IS NULL OR char_length(asset_name) <= 200) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_asset_name_length;


-- ============================================
-- 5. BUG_REPORTS — Numeric & Size Limits
-- ============================================

-- Turns used: 0–200
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_turns_used
  CHECK (turns_used IS NULL OR (turns_used >= 0 AND turns_used <= 200)) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_turns_used;

-- Placements JSONB: max 500KB
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_placements_size
  CHECK (octet_length(placements::text) <= 500000) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_placements_size;

-- Dev notes: max 5,000 chars (only written by authenticated devs, but cap it anyway)
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_br_dev_notes_length
  CHECK (dev_notes IS NULL OR char_length(dev_notes) <= 5000) NOT VALID;
ALTER TABLE bug_reports VALIDATE CONSTRAINT chk_br_dev_notes_length;
