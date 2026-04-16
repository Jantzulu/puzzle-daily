# Projectile System Refactor Plan

**Status:** Proposed — not started
**Scope:** `src/engine/simulation.ts`, `src/engine/actions.ts`, `src/types/game.ts`
**Goal:** Pay down the technical debt from the March 2026 deterministic-projectile refactor without changing observable gameplay.

---

## 1. Current State (as of audit)

The projectile system already has a sound **two-phase architecture** (per `CLAUDE_HANDOFF.md`):

- `resolveProjectiles()` — [src/engine/simulation.ts:2619](../src/engine/simulation.ts) — runs at turn boundaries inside `executeTurn()`. Handles deterministic collision, damage, reflect. Writes `hitResult` for visual consumption.
- `updateProjectiles()` — [src/engine/simulation.ts:2003](../src/engine/simulation.ts) — runs per-frame in `AnimatedGameBoard`. Visual-only: interpolates positions, consumes `hitResult`, spawns VFX.
- `updateProjectilesHeadless()` — [src/engine/simulation.ts:3127](../src/engine/simulation.ts) — runs during solver validation. Uses its own collision logic, parallel to `resolveProjectiles`.

Determinism at turn boundaries is **working**. This plan is about cleanup, not correctness.

## 2. Known Debt (from `CLAUDE_HANDOFF.md` + audit)

| # | Issue | Evidence |
|---|---|---|
| D1 | Visual loop mutates game-state objects; deep-copy captures visual noise | `proj.x`, `proj.y`, `proj.currentTileIndex` written by `updateProjectiles` but live on the same objects copied in `setGameState(JSON.parse(JSON.stringify(prev)))` |
| D2 | Collision logic duplicated between `resolveProjectiles` and `updateProjectilesHeadless` | Two functions, ~500 LOC each, each evolving independently — drift risk |
| D3 | Overlapping deferred-state flags | `pendingDeactivation`, `pendingProjectileDeath`, `hitResult`, `visualHealth`, `pendingReflectVfx`, `visualPastReflectPoint` — 6 flags coordinating the same "visual hasn't caught up yet" concept |
| D4 | Three visual interpolation paths evolved side-by-side | straight-line homing (`homingVisualStartX/Y/Time`), tile-based (`tilePath` + `visualTileIndex`), legacy |
| D5 | `updateProjectiles` is ~616 lines with deep branching | Single function covers 5 movement modes: straight-line homing, grid homing, pathfinding, reflected, legacy |
| D6 | Slow homing projectiles (speed 1–2) don't smoothly track moving targets | Noted in handoff as pending work; previous fix attempts broke fast projectiles |

## 3. Non-Goals & Acceptable Changes

**Hard rule — do not change:**
- The **gameplay loop**. Turn order, action resolution, damage numbers, status effect timing, victory/defeat conditions must remain identical. A puzzle that's solvable today must be solvable the same way after each phase.
- Determinism guarantees. Two identical runs continue to produce identical results.
- The public API of `executeTurn` / `initializeGameState`.

**Acceptable and in some cases required:**
- **Visual changes that bring visuals into alignment with logical behavior.** Logic is the source of truth. If a spell's projectile visually misses a target the logic has already recorded as hit, the correct fix is to change the visual to match — *not* change the logic to match the visual. This is explicitly the axiom from `CLAUDE_HANDOFF.md`: "Visuals must represent reality."
- As a consequence, recorded replays are **not** guaranteed to play back pixel-identically across phases. What is guaranteed is that turn-by-turn **logical** outcomes stay identical, and visuals stay consistent with those logical outcomes.

## 4. Proposed Phases

Phases are ordered smallest-blast-radius first so each can land independently with its own PR and test run. Stop at any point if confidence drops.

### ✅ Phase A — `ProjectileVisualState` introduced (done)

[`src/types/game.ts`](../src/types/game.ts) now exports a `ProjectileVisualState` interface grouping every visual-only field on `Projectile`: `x`, `y`, `startTime`, `currentTileIndex`, `tileEntryTime`, `homingVisualStartX/Y/Time`, `visualPastReflectPoint`. Phase C will introduce a `Map<string, ProjectileVisualState>` in `AnimatedGameBoard` and remove these fields from `Projectile`.

Every `Projectile` field is now annotated LOGICAL / VISUAL / BRIDGE inline so the categorization is unambiguous at the field level — no drift risk if someone adds a new field and forgets which role it plays.

**Zero behavior change.** The new interface is declared but not yet consumed at any callsite; the existing fields remain on `Projectile`. 198/198 tests still pass.

### Phase B — Extract movement-mode branches out of `updateProjectiles` — LOW RISK

**Goal:** shrink the 616-line function (D5) without changing semantics.

Extract these private functions in `simulation.ts` (keep them file-scoped, no exports):

- `updateStraightLineHomingVisual(proj, gameState, now)` — current straight-line homing branch
- `updateGridHomingVisual(proj, gameState, now)` — grid/pathfinding homing branch
- `updateTileBasedVisual(proj, gameState, now)` — non-homing `tilePath` branch
- `updateReflectedVisual(proj, gameState, now)` — reflected projectile branch

Each extracted function receives the same parameters, performs the same mutations. This is a pure code-motion refactor — each function should be identical to the existing nested block it replaces.

Use `git diff --color-words` to verify each extraction is textually identical except for the function wrapper. Run engine tests between each extraction.

**Verification:** engine test suite + manual smoke test of one puzzle with each projectile variant (one straight, one grid-homing, one pathfinding, one reflect).

### Phase C — Move visual fields to a side-table — MEDIUM RISK

**Goal:** fix D1 (visual mutation captured by deep copy).

1. Add a non-serialized `Map<string, ProjectileVisualState>` to `AnimatedGameBoard` component state (or to a ref — not to `GameState`).
2. In each extracted visual-update function from Phase B, read the active projectile's entry in the map instead of `proj.x/y/etc.`, and write updates to the map entry.
3. Remove visual fields from `Projectile` (they now live only in the map).
4. Adjust rendering code in `AnimatedGameBoard` to read from the map.
5. For the `resolveProjectiles` side: no changes — it was already operating on logical fields (`logicalTileIndex`, `tilePath`).

**The tricky part:** the visual map must be keyed on a stable projectile ID. Confirm `proj.id` (or equivalent) is already stable across turn resolution; if not, assign one in `spawnProjectile`.

**Verification:** 
- Engine tests still pass (no change to logical path).
- Manual test: every projectile variant, plus replay playback (deep-copy path).
- Explicitly verify that `JSON.stringify(gameState)` no longer contains `x`/`y`/`currentTileIndex` on projectiles.

### Phase D — Unify overlapping flags — MEDIUM RISK

**Goal:** collapse D3 into a single coherent state machine.

The 6 flags (`pendingDeactivation`, `pendingProjectileDeath`, `hitResult`, `visualHealth`, `pendingReflectVfx`, `visualPastReflectPoint`) all encode variants of "logical state decided, waiting for visual to catch up."

Propose a single `ProjectileDeferred` record:
```ts
interface ProjectileDeferred {
  deactivateAtTileIndex?: number;   // replaces pendingDeactivation
  deathEntityId?: string;           // replaces pendingProjectileDeath on targets
  visualHealthDeltaEntityId?: {id: string; delta: number}; // replaces visualHealth
  reflectVfx?: {...};                // replaces pendingReflectVfx
  hasPassedReflectPoint?: boolean;   // replaces visualPastReflectPoint
}
```

Carry over fields one at a time, with a test for each. Entity-side fields (`pendingProjectileDeath`, `visualHealth`) come last — they touch `PlacedCharacter` and `PlacedEnemy` ([src/types/game.ts:331-332, 593-594](../src/types/game.ts)).

**Verification:** engine tests + explicit replay regression test (record a puzzle run with reflect + deferred death, replay it, assert pixel-identical frame outputs at selected turn boundaries).

### Phase E — De-duplicate `updateProjectilesHeadless` vs `resolveProjectiles` — HIGH RISK

**Goal:** fix D2 — the highest-risk phase, deferred to last.

`updateProjectilesHeadless` exists because the solver runs without a frame loop but still needs to know collision outcomes. The collision rules need to match `resolveProjectiles` exactly, or the solver will accept/reject puzzles the real game would not.

Approach: extract the pure collision-resolution logic from `resolveProjectiles` into a helper `resolveProjectileCollisions(state, projectiles): CollisionOutcome[]`. Both `resolveProjectiles` (real game) and `updateProjectilesHeadless` (solver) call this helper with their respective projectile sets.

**Pre-requisite:** a golden-test suite that runs a corpus of saved puzzles through both the real simulator and the headless solver and asserts the same outcomes. Build this suite **before** touching the code.

**Verification:** golden tests, plus solver validation on existing validated puzzles (memory notes commit `ea1d488` fixed a validator/solver mismatch — don't regress that).

### Phase F — Slow homing projectile visual — DEFERRED

D6 is not a debt issue; it's a design gap. Out of scope for the refactor — recommend tackling it as a separate feature after Phase C lands, since Phase C gives a cleaner place to add a separate visual path without polluting the Projectile type.

---

## 5. Safety Rails

- Each phase is one PR, merged independently.
- Run the full engine test suite (`npm run test`) between every refactor step inside a phase, not just at the end.
- Any phase that breaks a replay regression test gets reverted immediately — the file-level `eslint-disable` on `simulation.ts` exists precisely because this file has broken before (see [feedback_lint_critical_files.md](../../memory/feedback_lint_critical_files.md)).
- **Do not combine phases.** The temptation will be strong to bundle B+C or C+D; resist it. Independent phases mean independent reverts.

## 6. Estimated Touch-Points

| Phase | Files touched | LOC delta (rough) | Engine tests needed |
|---|---|---|---|
| A | `types/game.ts` | +20 | 0 (additive) |
| B | `engine/simulation.ts` | +0 / reshape ~600 | 0 (existing cover it) |
| C | `engine/simulation.ts`, `components/game/AnimatedGameBoard.tsx`, `types/game.ts` | ~-7 fields, +1 map | 3–5 new (visual-state isolation) |
| D | `engine/simulation.ts`, `engine/actions.ts`, `types/game.ts` | ~-5 fields, +1 struct | 3–5 new (state machine transitions) |
| E | `engine/simulation.ts` | ~-400 (remove dup) | Golden corpus (10–20 puzzles) |

## 7. Determinism as a Non-Negotiable Constraint

**Project axiom:** two identical runs of a given puzzle must produce identical results. Replays must never surface outcomes that are impossible in the live game. The validator must reflect real game behavior exactly. Any change in this plan that risks violating those properties is out of scope.

Practical implications for this refactor:

- **Phase E is not the lowest priority — it's the most important.** `updateProjectilesHeadless` and `resolveProjectiles` diverging is a direct determinism threat: the solver can certify a puzzle as solvable that plays out differently under real conditions. Commit `ea1d488` already fixed one such mismatch; further divergence is latent risk. After Phase A (safe, additive), Phase E should be prioritized over D.
- **`Math.random()` in `puzzleGenerator.ts` is a determinism concern if the generator is ever invoked at runtime** (solver, validator, anything in the live-play path). If it's only invoked interactively by a human creator at puzzle-design time and its output is persisted, the non-determinism is contained. Audit the callsites before deciding — do not assume. If it touches anything downstream of a saved puzzle, replace with a seeded PRNG (Mulberry32) sourced from the puzzle's id/seed.
- **`Date.now()` in the per-frame visual loop is currently safe** because `resolveProjectiles` at turn boundaries owns all logical outcomes. Phase C is the guard that keeps it safe: once visual state leaves `GameState`, there is no path for wall-clock timing to leak into logical results via deep copy.

## 8. What NOT to Touch

These are correct-as-is and tempting to "while I'm in there" modify — don't:

- `computeTilePathWithWallLookahead` ([simulation.ts:498](../src/engine/simulation.ts)) — stable.
- `checkHomingPathForHits` ([simulation.ts:70](../src/engine/simulation.ts)) — stable.
- `reflectProjectile` ([simulation.ts:231](../src/engine/simulation.ts)) — working; revisit only if Phase D changes its return shape.

## 9. Open Questions

1. Do projectiles have stable IDs already? (Required for Phase C's visual map keying.)
2. Is there appetite for building the golden-test corpus Phase E requires, or should Phase E be deferred indefinitely?
3. Should the `ProjectileDeferred` struct in Phase D be per-projectile or per-turn? Per-projectile matches current flag placement; per-turn might be cleaner for the "pending death" case that lives on entities.

Bring these up before kicking off Phase C.
