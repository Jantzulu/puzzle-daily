// ============================================================================
// Pure validation + row-building for submit-completion (no Deno / network deps)
// ============================================================================
// Split out from index.ts so it can be unit-tested with the project's vitest
// (see src/services/__tests__/completionValidation.test.ts) while index.ts
// keeps the Deno/Supabase HTTP wrapper. Self-contained on purpose — no imports
// — so both the Deno bundler and Node test runner load it trivially.

export type Range = readonly [number, number];

// VALIDATION ranges — generous sanity bounds on the incoming submission.
// Score fields are SIGNED: turnBonus is negative when the player goes over
// par (scoring.ts), and the total carries that penalty — a non-negative bound
// would wrongly reject legitimate scores. The real integrity check is the
// breakdown-sum equality; these just reject absurd values.
export const RANGES = {
  charactersUsed: [0, 20],
  turnsUsed: [0, 200],
  livesRemaining: [0, 10],
  defeatTurn: [0, 200],
  attemptDurationMs: [0, 3_600_000],
  totalPoints: [-100_000, 100_000],
  component: [-50_000, 50_000],
} as const;

// STORAGE clamps — what actually gets written, matching the table's
// non-negative CHECK constraints (migration 008) and the prior client
// behavior (negative turnBonus stored as 0).
export const STORE = {
  total: [0, 100_000],
  component: [0, 50_000],
} as const;

export interface PuzzleLimits {
  maxTurns?: number;
  maxCharacters?: number;
  maxPlaceableCharacters?: number;
  availableCharacters?: string[];
}

export const inRange = (v: unknown, [min, max]: Range): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export const clamp = (v: number | undefined | null, [min, max]: Range): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null;

type Sub = Record<string, unknown>;

/** Returns null when valid, or a short rejection reason. */
export function validateCompletion(sub: Sub, puzzle: PuzzleLimits | null): string | null {
  // --- required shape ---
  if (typeof sub.playerId !== 'string' || !sub.playerId) return 'missing playerId';
  if (typeof sub.puzzleId !== 'string' || !sub.puzzleId) return 'missing puzzleId';
  if (sub.outcome !== 'victory' && sub.outcome !== 'defeat') return 'bad outcome';
  if (!inRange(sub.charactersUsed, RANGES.charactersUsed)) return 'charactersUsed out of range';
  if (!Array.isArray(sub.characterIds) || sub.characterIds.length > 20) return 'bad characterIds';
  if (!inRange(sub.turnsUsed, RANGES.turnsUsed)) return 'turnsUsed out of range';
  if (sub.livesRemaining !== undefined && !inRange(sub.livesRemaining, RANGES.livesRemaining)) return 'livesRemaining out of range';
  if (sub.attemptDurationMs !== undefined && !inRange(sub.attemptDurationMs, RANGES.attemptDurationMs)) return 'attemptDurationMs out of range';

  // The listed heroes should match the count placed.
  if ((sub.characterIds as unknown[]).length !== sub.charactersUsed) return 'characterIds length != charactersUsed';

  // --- outcome coherence ---
  if (sub.outcome === 'defeat') {
    const r = sub.defeatReason;
    if (r !== undefined && r !== null && r !== 'damage' && r !== 'turns' && r !== 'concede') return 'bad defeatReason';
    if (sub.defeatTurn !== undefined && sub.defeatTurn !== null && !inRange(sub.defeatTurn, RANGES.defeatTurn)) return 'defeatTurn out of range';
  } else {
    // victory must carry a coherent score
    const score = sub.score as Record<string, unknown> | undefined;
    if (!score) return 'victory without score';
    if (score.rank !== 'bronze' && score.rank !== 'silver' && score.rank !== 'gold') return 'bad rank';
    const b = (score.breakdown ?? {}) as Record<string, unknown>;
    const parts = [b.basePoints, b.characterBonus, b.turnBonus, b.livesBonus, b.sideQuestPoints];
    if (!inRange(score.totalPoints, RANGES.totalPoints)) return 'totalPoints out of range';
    for (const p of parts) if (!inRange(p, RANGES.component)) return 'score component out of range';
    // Formula-independent anti-fabrication: total must equal its parts
    // (scoring.ts builds total from these exact values, so this is exact).
    const sum = (parts as number[]).reduce((s, n) => s + n, 0);
    if (sum !== score.totalPoints) return `total ${score.totalPoints} != breakdown sum ${sum}`;
  }

  // --- per-puzzle limits (only when the puzzle is a known live puzzle) ---
  if (puzzle) {
    const maxPlaceable = puzzle.maxPlaceableCharacters ?? puzzle.maxCharacters ?? 20;
    if ((sub.charactersUsed as number) > maxPlaceable) return 'charactersUsed exceeds puzzle limit';
    const maxTurns = puzzle.maxTurns ?? RANGES.turnsUsed[1];
    if ((sub.turnsUsed as number) > maxTurns) return 'turnsUsed exceeds puzzle limit';
    if (Array.isArray(puzzle.availableCharacters) && puzzle.availableCharacters.length > 0) {
      const allowed = new Set(puzzle.availableCharacters);
      for (const id of sub.characterIds as string[]) {
        if (!allowed.has(id)) return 'hero not available in this puzzle';
      }
    }
  }

  // === PHASE B SEAM ===================================================
  // When the engine is portable server-side, re-run the submitted placements
  // through the shared simulation + scoring and reject if the recomputed
  // outcome/score doesn't match `sub`. Requires the client to also send the
  // placement inputs. Deterministic → validates whatever scoring is current.
  // ===================================================================

  return null;
}

/** Build the row to insert. Assumes validateCompletion already passed. */
export function buildCompletionRow(sub: Sub, userId: string | null): Record<string, unknown> {
  const score = sub.score as Record<string, unknown> | undefined;
  const breakdown = (score?.breakdown ?? {}) as Record<string, number>;
  const row: Record<string, unknown> = {
    player_id: sub.playerId,
    user_id: userId,
    puzzle_id: sub.puzzleId,
    puzzle_date: sub.puzzleDate ?? null,
    outcome: sub.outcome,
    characters_used: clamp(sub.charactersUsed as number, RANGES.charactersUsed),
    character_ids: (sub.characterIds as string[]).slice(0, 20),
    turns_used: clamp(sub.turnsUsed as number, RANGES.turnsUsed),
    lives_remaining: clamp(sub.livesRemaining as number | undefined, RANGES.livesRemaining),
    defeat_reason: sub.defeatReason ?? null,
    defeat_turn: clamp(sub.defeatTurn as number | undefined, RANGES.defeatTurn),
    attempt_duration_ms: clamp(sub.attemptDurationMs as number | undefined, RANGES.attemptDurationMs),
  };
  if (sub.outcome === 'victory' && score) {
    row.rank = score.rank;
    row.total_points = clamp(score.totalPoints as number, STORE.total);
    row.base_points = clamp(breakdown.basePoints, STORE.component);
    row.character_bonus = clamp(breakdown.characterBonus, STORE.component);
    row.turn_bonus = clamp(breakdown.turnBonus, STORE.component);
    row.lives_bonus = clamp(breakdown.livesBonus, STORE.component);
    row.side_quest_points = clamp(breakdown.sideQuestPoints, STORE.component);
    row.completed_side_quests = ((score.completedSideQuests as string[]) ?? []).slice(0, 20);
    row.par_met_characters = (score.parMet as Record<string, boolean>)?.characters ?? null;
    row.par_met_turns = (score.parMet as Record<string, boolean>)?.turns ?? null;
  }
  return row;
}
