/**
 * STALE INDEX-KEYED BOARD STATE (2026-09-30 user report: "subsequent replays
 * of the same level do not have that enemy that enters at a later turn
 * actually enter correctly, and instead starts where it would end up").
 *
 * The board keys several render-only records by ENEMY ARRAY INDEX (mid-game
 * walk-ins, death animations, dead-state diffs, soul returns). The engine's
 * enemy array is append-only within a run, and deterministic — a scheduled
 * visitor's copy lands at the SAME index every run. But a retry, a reset or
 * a replay step-back hands the board a shorter array under the same puzzle
 * id, and the board is not remounted, so those records outlive the entities
 * they described and the next entity at that index inherits them: the
 * visitor's walk-in from run 1 suppressed run 2's walk-in (the finished
 * entry drew the sprite straight onto its tile), and a visitor that died in
 * run 1 would read as REVIVED on its run-2 arrival.
 *
 * Pure so the rules are unit-tested (the board's canvas has no harness).
 */

export interface MidGameWalkEntry {
  midGame?: boolean;
  /** The spawnedOnTurn of the entity the walk was built for. */
  spawnTurn?: number;
}

/**
 * Mid-game walk-in entries that no longer describe the entity at their
 * index: the entity is gone (retry / reset / step-back to before the
 * spawn), a different entity now holds the index (a summon or raise
 * appended where the visitor was), or the state has stepped back before the
 * spawn turn. Pre-game entrance walks (no `midGame`) are never stale here —
 * they keep their once-per-mount contract. `<` rather than `<=`: a later
 * state update on the spawn turn itself must not restart a walk in progress.
 */
export function staleMidGameWalkIns(
  entries: Map<number, MidGameWalkEntry>,
  enemies: ReadonlyArray<{ spawnedOnTurn?: number }>,
  currentTurn: number
): number[] {
  const stale: number[] = [];
  entries.forEach((w, idx) => {
    if (!w.midGame) return;
    const e = enemies[idx];
    if (!e || e.spawnedOnTurn !== w.spawnTurn || currentTurn < (w.spawnTurn ?? 0)) stale.push(idx);
  });
  return stale;
}

/** Keys at or past `length` — records for entities the current array no longer has. */
export function indicesBeyond(keys: Iterable<number>, length: number): number[] {
  const out: number[] = [];
  for (const k of keys) if (k >= length) out.push(k);
  return out;
}
