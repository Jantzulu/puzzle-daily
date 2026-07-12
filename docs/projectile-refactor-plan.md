# Projectile System Refactor Plan

**Status:** IN PROGRESS — Phases A+B+E done (E landed 2026-07-12); Phase C next, then D
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

### ✅ Phase B — Movement branches extracted (done)

Four file-scoped helpers now live in [`simulation.ts`](../src/engine/simulation.ts), extracted verbatim from the nested conditionals previously inside `updateProjectiles`:

- `updateStraightLineHomingVisual(proj, now)` — straight-line homing with spawn anchor
- `updateGridHomingVisual(proj)` — grid homing without tilePath (per-frame follow)
- `updateTileBasedVisual(proj, now)` — tilePath movement; handles three sub-cases internally (straight, two-segment reflect, standard tile-to-tile)
- `updateLegacyNoPathVisual(proj, now)` — non-homing projectiles without tilePath

Each helper returns `{ newX, newY, reachedTarget }`. `updateProjectiles` now dispatches on the same conditions as before (identical branch order and predicates), applies `proj.x = newX; proj.y = newY`, and runs the shared bridge-field consumption (`pendingReflectVfx`, `hitResult`, `pendingDeactivation`).

**Pure code motion.** Same math, same side effects, same branch predicates. No behavior change. 198/198 tests pass, and `tsc -b --noEmit` reports zero new errors attributable to Phase B (pre-existing errors unchanged).

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

### ✅ Phase E — De-duplicate `updateProjectilesHeadless` vs `resolveProjectiles` (done 2026-07-12)

**Goal:** fix D2 — the highest-risk phase.

**What was already shared before this phase** (extracted incrementally
during the pierce/bounce/audit work): `walkNonHomingTick` (the non-homing
collision walk), `walkReflectedPath` / `walkReflectedPathOnTiles` (reflected
legs), `applyEntityHit` / `applyHealingHit` (hit application with a
`HitMode` param). The original "-400 LOC" estimate predated those.

**What this phase extracted** (commits `7edb4a7`, `7d0203e`, `75df15e`):

1. `recordProjectileSpawnOnce` — identical spawn-event blocks unified.
2. `resolveHomingTargetEntity` — the 3-stage homing target lookup
   (reflected-src → array-index → id-find). Unified liveness on
   `isEntityFunctional` (equivalent to headless' old `!dead` since
   headless never sets `pendingProjectileDeath`).
3. `planHomingTick` — the pure per-turn homing decision (range gate, wall
   check, reach-vs-advance, BFS budget, clamped fractional move). Both
   modes consume the plan; callers keep mode-specific bookkeeping.

**Parity fix shipped with #3:** the homing wall check
(`homingIgnoreWalls: false`) previously existed ONLY in real mode —
headless/solver bolts flew through walls the live game stops at. Pinned
in `audit-parity.test.ts` ("homing wall check" case; no corpus case
covered it). Note the flag defaults to TRUE (pass through walls), so
only opt-out spells were affected.

**Residual known divergences (documented, deliberately NOT fixed here):**

- **`checkHomingPathForHits` is real-mode only** — homing bolts with
  `homingHitAlongPath` (grid/pathfinding styles) damage entities they
  pass in the live game but not in the solver. Fixing it requires a
  `HitMode` param on a §8 do-not-touch function (it hard-codes
  pendingVisualDamage / pendingProjectileDeath bookkeeping). Same bug
  class as the wall check; needs its own careful session.
- **Homing reflect timing** — real mode resolves the reflected return
  leg in the SAME turn (immediate walk); headless re-targets the caster
  and flies back over subsequent turns. Final outcomes converge in
  practice (gate is green) but intermediate turn timing differs; a kill
  decided by a reflected homing bolt could land on different turns.
- **THROW_PLACE landing tile** — real places at the last valid tile of
  the visual tilePath with a fall-back to the previous tile if the last
  is a wall; headless places at `floor(logical)` with a wall check but
  no fall-back. Divergence only reachable in edge layouts.

**Verification:** 470 tests green (full suite + 22-case Phase E gate +
corpus goldens + new pin). `tsc -b` clean. (Memory notes commit `ea1d488`
fixed a validator/solver mismatch — not regressed; corpus goldens
unchanged.)

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

1. ✅ ANSWERED (2026-07-12): projectiles have stable ids — `proj.id` is
   assigned at spawn and used as the stable key throughout (logs, replay
   events, pierce dedup). Phase C's visual map can key on it.
2. ✅ ANSWERED: the golden corpus exists and the parity gates are green
   (see Phase E pre-requisite above). Phase E is GO.
3. OPEN: `ProjectileDeferred` per-projectile vs per-turn — decide when
   Phase D starts.

Execution order (settled 2026-07-12, per §7): **E → C → D**, one phase
per session, full suite + corpus green between steps, no combining.
E landed 2026-07-12 — **Phase C is next** (visual fields → side-table
in AnimatedGameBoard, keyed on the stable `proj.id`).
