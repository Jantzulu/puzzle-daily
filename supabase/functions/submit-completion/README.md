# submit-completion (Edge Function)

Server-side gate for `puzzle_completions`. The client can no longer write the
table directly — this function is the sole writer, validating each submission
before inserting with the service-role key.

## Deploy (one-time, and after any change here)

Requires the Supabase CLI, logged in and linked to the project.

```bash
# from the repo root
supabase functions deploy submit-completion
```

Then apply the RLS migration that removes direct client inserts:

```bash
supabase db push          # applies migrations/011_completion_server_validation.sql
# — or paste 011 into the Supabase dashboard SQL editor and run it.
```

No secrets to set: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into every Edge Function automatically.

## Rollout order & the no-players note

`011` denies anon/authenticated INSERT, so completions only record once the
function is live. The client is fire-and-forget: before the function is
deployed (or if it rejects a row) nothing breaks — the completion is just not
recorded. With no public players yet the order is low-stakes, but the clean
sequence is: **deploy the function → apply 011 → (client already points at it).**

To confirm it's live:

```bash
# from the browser console on the player site, after opting into analytics:
# a normal win/loss should now appear in puzzle_completions; a hand-forged
# insert via the anon key should be rejected by RLS.
```

## What it checks (Phase A — formula-independent)

- Required shape, value ranges (mirrors the migration-008 CHECK constraints).
- Outcome coherence (victory carries a valid rank + score; defeat's reason).
- **Score breakdown sums to its total** — the core anti-fabrication check.
  `scoring.ts` builds the total from those exact components, so this is exact.
- Per-puzzle limits read from `puzzles_live`: characters/turns within the
  puzzle's caps, heroes drawn from its available set. Skipped for unknown
  (training/dev) puzzles; the structural checks still apply.

Logic lives in `validate.ts` and is unit-tested by the project's vitest
(`src/services/__tests__/completionValidation.test.ts`, 14 cases).

## Phase B (later)

Full deterministic re-simulation: re-run the submitted placements through the
shared engine + `scoring.ts` and reject any mismatch — validates whatever
scoring formula is current. Requires the client to also send placement inputs.
See the `PHASE B SEAM` marker in `validate.ts`.
