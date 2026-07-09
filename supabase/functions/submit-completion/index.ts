// ============================================================================
// Edge Function: submit-completion
// ============================================================================
// The ONLY writer to puzzle_completions (migration 011 revokes anonymous
// INSERT, so direct client writes are rejected by RLS). The client sends a
// semantic submission; this function validates it and inserts with the
// service-role key.
//
// PHASE A (here): formula-INDEPENDENT structural validation — see validate.ts.
// Closes the "POST a fabricated max score from the console" hole without
// depending on what a "good" score is, so scoring can keep evolving.
//
// PHASE B (later): full deterministic re-simulation — see the seam in
// validate.ts. Requires the client to also send placement inputs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateCompletion, buildCompletionRow, type PuzzleLimits } from './validate.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let sub: Record<string, unknown>;
  try {
    sub = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // Derive the authenticated user (if any) from the caller's JWT — never trust
  // a client-sent user_id.
  let userId: string | null = null;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data } = await admin.auth.getUser(authHeader.slice(7));
    userId = data.user?.id ?? null;
  }

  // Fetch the live puzzle for limit checks (absent for training/dev puzzles —
  // then limit checks are skipped, structural checks still apply).
  let puzzle: PuzzleLimits | null = null;
  if (typeof sub.puzzleId === 'string') {
    const { data } = await admin.from('puzzles_live').select('data').eq('id', sub.puzzleId).maybeSingle();
    puzzle = (data?.data as PuzzleLimits) ?? null;
  }

  const reason = validateCompletion(sub, puzzle);
  if (reason) return json({ error: 'validation failed', reason }, 422);

  const { error } = await admin.from('puzzle_completions').insert(buildCompletionRow(sub, userId));
  if (error) {
    // Rate-limit trigger (migration 010) is expected on fast retries — treat
    // as success so the client doesn't retry.
    if (error.code === 'P0001' && error.message?.includes('Rate limit')) {
      return json({ ok: true, deduped: true });
    }
    return json({ error: 'insert failed', code: error.code }, 500);
  }

  return json({ ok: true });
});
