-- ============================================================
-- Migration: Player Roles & Anonymous Linking
-- Adds role column to profiles, backfills existing users as
-- creators, prevents self-role-change, and provides RPC
-- function to link anonymous completions on signup/login.
-- ============================================================

-- 1. Add role column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player'
  CHECK (role IN ('player', 'creator'));

-- 2. Backfill all existing users as creators (they're all team members)
UPDATE profiles SET role = 'creator' WHERE role = 'player';

-- 3. Update the auto-create trigger to include role
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'player'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Prevent users from changing their own role
CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  NEW.role = OLD.role;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_prevent_role_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_change();

-- 5. Index on role for query performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 6. RPC function to link anonymous completions to authenticated user
CREATE OR REPLACE FUNCTION link_anonymous_completions(p_player_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  linked_count INTEGER;
BEGIN
  UPDATE puzzle_completions
  SET user_id = auth.uid()
  WHERE player_id = p_player_id
    AND user_id IS NULL;
  GET DIAGNOSTICS linked_count = ROW_COUNT;
  RETURN linked_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
