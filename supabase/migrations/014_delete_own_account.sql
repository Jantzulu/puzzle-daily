-- ============================================================
-- Migration: Self-service account deletion
-- A signed-in PLAYER deletes their own account from the profile page
-- (ProfilePage → AuthContext.deleteAccount → this RPC). It removes the
-- player's saved puzzle results, then the auth user itself, which
-- cascades to their profile (001: ON DELETE CASCADE) and detaches any
-- activity_log rows (002: ON DELETE SET NULL). Auth sessions and
-- identities go with the user.
--
-- Creator (team) accounts are refused: deleting one would lock a team
-- member out of the editors. Remove those from the Supabase dashboard.
--
-- Results recorded only under a device's random ID (never linked to the
-- account) stay anonymous; the privacy policy offers deletion of those on
-- request.
--
-- APPLY: paste into the Supabase SQL editor (runs as postgres, which owns
-- the function — the SECURITY DEFINER delete from auth.users needs that),
-- then test with a throwaway player account.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role <> 'player') THEN
    RAISE EXCEPTION 'Team accounts cannot be deleted from the app' USING ERRCODE = '42501';
  END IF;

  DELETE FROM puzzle_completions WHERE user_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Callable only by a signed-in user (it acts on auth.uid() alone).
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
