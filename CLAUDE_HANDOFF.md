# Claude Handoff Document - Puzzle Daily

Last Updated: April 21, 2026 (late session — replay + homing overhaul)

## Project Overview

**Puzzle Daily** (branded "Knightly") is a React/TypeScript turn-based puzzle game platform with a medieval dungeon theme. It features a full editor suite and a player-facing game.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom dungeon-themed palette
- **Canvas Rendering**: Custom canvas-based AnimatedGameBoard (no Pixi.js)
- **Backend**: Supabase (PostgreSQL) for cloud puzzles, daily scheduling
- **Hosting**: Netlify (editor at knightly-dev, player at separate site)
- **Repository**: https://github.com/Jantzulu/puzzle-daily.git

## Key Architecture

### File Structure
```
src/
  components/
    game/           # Game play (Game.tsx, AnimatedGameBoard.tsx, CharacterSelector.tsx)
    editor/         # Asset editors (MapEditor.tsx, CharacterEditor.tsx, EnemyEditor.tsx, SpellAssetBuilder.tsx, StatusEffectEditor.tsx, etc.)
    shared/         # Shared UI components
  engine/
    simulation.ts   # Turn execution, projectile resolution, status effects
    actions.ts      # Entity action execution, spell casting, triggers
    utils.ts        # Direction math, collision helpers
    scoring.ts      # Score calculation
  types/
    game.ts         # ALL type definitions (PlacedCharacter, PlacedEnemy, Projectile, SpellAsset, StatusEffectAsset, etc.)
  utils/
    assetStorage.ts # localStorage CRUD for all asset types + migrations
  data/             # Built-in characters, enemies, puzzles
```

### Projectile System (CRITICAL - read carefully)

The projectile system was extensively refactored for determinism. Here is how it works:

**Two-phase architecture:**
1. **`resolveProjectiles()`** (in simulation.ts) - runs at turn boundaries inside `executeTurn()`. Deterministic collision resolution. Advances projectiles logically, checks hits, applies damage, handles reflect. Sets `hitResult` on projectiles for visual consumption.
2. **`updateProjectiles()`** (in simulation.ts) - runs per-frame in AnimatedGameBoard's animation loop. Visual-only: interpolates projectile positions, consumes `hitResult` when visual reaches the target, spawns VFX.

**Key design decisions:**
- Non-homing projectiles get their `tilePath` at spawn time (via `computeTilePathWithWallLookahead`). `resolveProjectiles` does NOT overwrite `tilePath` - it only updates `logicalTileIndex` and sets `hitResult`.
- Homing straight-line projectiles use `homingVisualStartX/Y/Time` for smooth interpolation from spawn to target, independent of `resolveProjectiles`.
- Reflected projectiles use a combined approach+reflect `tilePath` with `reflectAtTileIndex` for tint switching. `reflectProjectile()` clears `homingVisualStartX/Y/Time` so reflected projectiles use tile-by-tile animation.
- `visualTileIndex` is calculated from time (`elapsed / tileTransitTime`), NOT from a stored `currentTileIndex`. This avoids deep-copy mutation issues.
- `hitResult` is the unified "logic done, waiting for visual" signal — whether a hit landed, a throw/place item landed, or the projectile simply ran out of range / hit a wall. The pre-Phase-D `pendingDeactivation` flag is gone; range-exhaustion sets a minimal `hitResult = { hitTileIndex: end, deactivate: true }` with no VFX/death fields.
- `pendingProjectileDeath` defers entity death until the projectile visual arrives. `visualHealth` defers HP bar changes similarly.
- `resolveProjectiles` and `updateProjectilesHeadless` share the same underlying collision walkers (`walkNonHomingTick`, `walkReflectedPath`, `walkReflectedPathOnTiles`, `walkHomingReflectedPath` via homing-style tiles). Each emits a step log (travel / wall / hit / reflect); each mode's wrapper translates steps to bridge-field writes (real) or timeline events (headless). Drift between solver and live game is now structurally impossible in these paths — Phase E's goal.
- Pierce dedup for enemies tracks by **array index** (`hitEnemyIndices`), not enemyId string — required because real puzzles commonly place multiple instances of the same enemy type.
- Reflected homing bolts route back to the caster using the projectile's **own homing path style** (straight/grid via `getTilesAlongLine`, pathfinding via `findPathBFS`). The reflected-leg walk uses the shared `walkReflectedPathOnTiles` helper with a precomputed tile path. Reflected hits override the normal `isHostileHit` check — reflected projectiles are always hostile (reflect only fires on damage spells).

**Known issues / pending work (post April 20, 2026 session):**
- Slow homing projectiles (speed 1-2) have visual issues - they do not smoothly track moving targets. The straight-line interpolation was designed for fast projectiles. Attempts to fix (per-frame following, cumulative distance) broke fast projectiles. The slow homing fix needs a separate visual path that does not affect fast projectiles.
- Replays show projectiles via an event timeline system (`projectileTimeline` in Game.tsx). Events are recorded during headless replay generation. `buildReplayProjectiles()` reconstructs projectile visuals from events. Step-by-step replay works with animation + freeze. Some edge cases remain with slow projectiles in replays.
- **Wall bouncing restored 2026-04-20.** `bounceOffWalls`, `maxBounces`, `bounceBehavior` (`reflect`/`turn_around`/`turn_left`/`turn_right`) now consumed by `walkNonHomingTick`. On wall hit with bounce budget remaining, the walker emits a `bounce` step, mutates `proj.direction`/`startX/Y`/`logicalTileIndex`/`bounceCount`, and continues walking within the same turn budget. Each leg gets a fresh `range` budget (matches original 8b049df semantics). Deterministic — `random` behavior unsupported (would need seeded PRNG). Corpus case 14 updated with correct bounce golden. Visual for bouncing projectiles: per-turn tilePath refresh mirrors homing pattern.
- **Homing range-gate bypass fixed 2026-04-20.** Straight-line homing was measuring `totalDistanceTraveled` from `homingVisualStartX/Y` (which gets re-anchored every turn for slow-projectile interpolation), so the measured distance was always ~0 and range never fired. Now measures from stable `proj.startX/Y`. Corpus case 22 locks in the fix. The "disappearing visuals" symptom reported in the same bug was downstream of this: once the broken range gate was flying projectiles indefinitely, edge cases (target death, wall-block) produced degenerate 1-tile tilePaths that flashed for a frame. Fixed by the range-gate correction.
- Projectile system still has remaining technical debt, but substantially reduced vs pre-April-20:
  - ✅ `pendingDeactivation` unified with `hitResult` (Phase D-a, commit `4f9076d`).
  - ✅ Collision logic deduplicated between `resolveProjectiles` and `updateProjectilesHeadless` via shared `walkNonHomingTick` / `walkReflectedPath` / `walkReflectedPathOnTiles` helpers (Phase E1/E2/E3, commits `0c88664`/`26fabcb`/`8ece3e5`).
  - ✅ `visualPastReflectPoint` moved to AnimatedGameBoard's visual-state side-table (Phase C-1, commit `48f8549`).
  - ✅ `x`/`y` removed from Projectile; visual position lives in the side-table, logical position in new `logicalX`/`logicalY` fields (Phase C-2, commit `ab45367`).
  - ✅ Per-frame `currentTileIndex` visual mutation removed; visual progress lives in side-table. `startTime` / `tileEntryTime` / `homingVisualStartX/Y/Time` reclassified BRIDGE (no per-frame writes — safe on Projectile). Phase C is effectively complete (Phase C-3, 2026-04-20).
  - ⏳ Entity-owned deferred-visual pair (`pendingProjectileDeath` + `visualHealth` on PlacedCharacter/PlacedEnemy) still split across the entity objects. Phase D-b below.

### Reflect Status Effect

The Reflect status effect bounces incoming projectiles back:
- `reflectProjectile()` reverses direction, swaps team targeting (`teamSwapped`), applies tint
- Directional filter: `reflectDirections` on StatusEffectAsset (front/back/left/right checkboxes)
- `canReflectDirection()` checks if projectile approach angle matches allowed zones
- Reflected projectiles cannot bounce again (`proj.reflected = true`)
- Combined approach+reflect visual path with `reflectAtTileIndex` for tint timing
- `visualPastReflectPoint` boolean prevents glow/tint flickering
- Separate `reflectImpactSprite` for the bounce VFX (distinct from projectile override sprite)
- Reflect impact VFX is deferred via `pendingReflectVfx` until visual reaches reflect point

### Stealth Status Effect

- Stealthed entities cannot trigger opposing team's proximity/range/contact triggers
- Cannot be auto-targeted by homing projectiles
- Same-team entities CAN still see stealthed allies
- `isEntityStealthed()` helper in actions.ts

### Steadfast Status Effect

- Prevents entity from being affected by any redirect effects (spell, item, or tile)
- `isSteadfast()` helper checked at all redirect application sites

### Redirect Spell System

- Projectile that changes target's facing direction on hit
- Modes: clockwise, counter_clockwise, face_projectile, face_away, fixed
- Player-choosable direction: `redirectAcceptsUserInput` flag, compass UI in CharacterSelector
- `spellDirectionOverrides` on PlacedCharacter, `pendingSpellDirectionOverrides` for pre-placement
- Also available as collectible effect and tile behavior

### Initial Status Effects

- Characters and enemies can start with status effects configured in their asset editors
- `initialStatusEffects` array on Character/Enemy types
- Duration override (-1 = permanent/99999 turns)
- Applied during character placement (heroes) and `initializeGameState()` (enemies)

### Spell Types

- `MELEE` / `MELEE_CONE` - close-range attacks
- `LINEAR` (was MAGIC_LINEAR, RANGE_LINEAR merged) - projectile in a line
- `REDIRECT` - changes target's facing direction
- `RESURRECT` - revives dead allies
- `PUSH` - pushes target tiles away
- `THROW_PLACE` - place or throw a collectible item onto a tile (see below)
- Backstab: per-spell toggle for 2x damage from behind (`isAttackFromBehind()` in utils.ts)

### Throw/Place Spell System

- Entity places (range 0-1) or throws (range 2+) a collectible item onto the board
- No damage component — purely for item placement
- Range 0: place on own tile, Range 1: adjacent tile, Range 2+: projectile with item sprite
- Projectile passes through entities (only stops at walls or max range)
- `placeCollectibleFromSpell()` in actions.ts creates the PlacedCollectible
- Grace period: 1-turn caster immunity by default (configurable), with permanent immunity toggle
- Immediate pickup: entity standing on landing tile picks it up right away (respecting permissions + grace)
- Item duration/despawn: optional `duration` field on all CustomCollectible (permanent by default)
  - `processCollectibleDurations()` in simulation.ts decrements each turn, triggers despawn
  - Scale-up animation on spawn (400ms easeOutBack), scale-down on despawn (400ms easeInBack)
  - Throw/Place spell can override duration, pickup permissions via `ThrowPlaceConfig`
- `PlacedCollectible` extended with: `spawnTurn`, `spawnTime`, `duration`, `despawning`, `despawnTime`, `placedByEntityId`, `placerImmuneUntilTurn`, `placerPermanentlyImmune`, `overridePermissions`, `sourceSpellId`
- ItemsDisplay shows "Thrown by" / "Placed by" badges with entity sprites and duration info
- Blocked by Silenced status effect (classified as ranged)

### Homing Projectile Path Styles

- `straight` - smooth line from caster to target (works well for fast projectiles)
- `grid` - tile-by-tile path following grid
- `pathfinding` - BFS pathfinding around walls
- `homingIgnoreWalls` - whether homing projectiles pass through walls
- `homingHitAlongPath` - whether grid/pathfinding can hit entities along the path (not just target)
- Health bar glow indicator for homing targets (red for damage, green for healing)

### Validator/Solver

- Async puzzle solver in MapEditor validates solvability
- Tests all character placement permutations
- For redirect spells with `redirectAcceptsUserInput`, tests all 8 direction permutations
- Headless mode uses `updateProjectilesHeadless()` (separate from visual projectile system)
- Shows optimal placement with redirect direction in validation modal

### Turn Execution Order (in `executeTurn`)

1. Process status effects (turn start)
2. Character actions
3. Enemy actions
4. `resolveProjectiles()` - projectile advancement and collision
5. Process status effects (turn end)
6. Check victory/defeat conditions

### Map Editor Autosave

- Flushes to localStorage on `useEffect` cleanup (handles Vite HMR)
- `beforeunload` handler for tab close

### Replay System

- Generates turn history via headless simulation
- Event timeline records projectile spawn/hit/reflect/deactivate events
- `buildReplayProjectiles()` reconstructs projectile visuals from events
- Step forward/backward plays one turn of animation then freezes
- `replayStepAnimating` flag controls the animation window
- `replayFrozen` prop on AnimatedGameBoard freezes `updateProjectiles`

## Pending Tasks

### Next session — start here

Coming out of a long 2026-04-21 session that was entirely a deep playtest pass. Replays are solid. Homing projectiles (straight/grid) and duplicate-enemyId targeting were rebuilt from the ground up. All known gameplay bugs the playtest surfaced are closed.

**Remaining playtest coverage** (paused so we could commit):
- **Homing — pathfinding style** (straight + grid were tested this session; pathfinding was not)
- **Reflect + homing** (quick smoke test)
- **Projectile edge cases** — pierce on duplicate-enemyId enemies (should work now that targeting and dedup both use array index, but verify), bolt-through-wall regression, defeat-while-in-flight regression
- **Regression sweep** — melee, MELEE_CONE, redirect spells, throw/place, status effects (reflect tint, stealth, steadfast)

**Debug infrastructure**: `HOMING_DEBUG` flag in `simulation.ts:14` (exported). Flip to `true` to re-enable the trace logs we used this session — spawn, resolve, visual-tile, hit-consume, death-mutations, win-check, non-homing-resolve. All gated on this one flag. Leave it off for normal play; it's loud.

1. **Continue the playtest from where we paused** — items above. Same format as this session: run a scenario, paste logs if weird, we debug.

2. **Feature work.** [feature-roadmap.md](feature-roadmap.md) or any new feature idea. The handoff's "pending — not yet started" list from in-progress memory mentioned: Replay System (done), Hints, Analytics, Sandbox Mode.

3. **Phase D-b (optional refactor): consolidate the entity-owned deferred-visual pair.** `pendingProjectileDeath` and `visualHealth` live on PlacedCharacter/PlacedEnemy and coordinate "entity is logically dead/damaged but visual hasn't caught up." They aren't purely bridge flags — `pendingProjectileDeath` is read elsewhere to skip dying entities for targeting — so this is a semantic change, not just a rename. Lower priority; consider only if a concrete bug motivates it.

4. **Replay visual-state reseed quirk (minor, deferred).** After Phase C-2, if a replay step-reset creates a new `Projectile` object with the same `id` as a previously rendered one, `projectileVisualStateRef` may still hold the old entry's `x/y` from the previous frame. `drawProjectile` falls back to `proj.logicalX/Y` only when the entry is MISSING, not when it's stale. One-frame visual artifact before `updateProjectiles` overwrites it. Fix options: (a) have Game.tsx replay handlers call a ref-exposed `resetVisualState(id)` on AnimatedGameBoard, (b) reseed when `|logicalX - vs.x| > N` as a heuristic, (c) tolerate it. Low priority — not observed as a gameplay bug, flagged for the visuals-polish pass.

### Open spawn tasks (deferred bugs / features)

4. **Wall bounce: `random` behavior.** `reflect`, `turn_around`, `turn_left`, `turn_right` are deterministic and implemented. `random` needs a seeded PRNG to keep determinism — not yet wired up. `computeBounceDirection` returns null for it, which falls through to a regular wall hit. When adding random, seed from `proj.id` + `proj.bounceCount` or similar so replays stay identical.

5. **Wall bounce: visual direction rotation.** `updateTileBasedVisual` rotates the projectile sprite from first-tile-to-last-tile of tilePath. For a Z-shaped bounced path this gives an averaged angle rather than the per-segment direction. Low-priority polish — pre-existing compromise for reflects too.

### One-off tasks (pre-existing)

6. **Slow homing projectile visuals** — speed 1-2 homing spells do not visually track moving targets well. Needs a separate visual approach for slow homing that does not break fast projectile behavior. Best tackled AFTER projectile Phase C (gives a cleaner place for a new visual code path).

7. **Replay projectile polish** — edge cases with slow projectiles, melee VFX timing.

### Done (keep for context)

- ~~**`puzzleGenerator.ts` Math.random audit**~~ — **Done 2026-04-17**. Re-verified: only `GeneratorDialog.tsx` → `MapEditor.tsx` (editor-only). No runtime path. Precondition: if any future feature invokes the generator at runtime, switch to a seeded PRNG first.
- ~~**Sentry environment variables**~~ — **Done 2026-04-18**.
- ~~**Run `007_player_roles.sql` and `010_silent_completion_rate_limit.sql` migrations** against Supabase.~~ — **Done 2026-04-19.**
- ~~**POST error on puzzle completion**~~ — **Done 2026-04-18**.
- ~~**Remove legacy `ATTACK_FORWARD` / `ATTACK_RANGE` / `ATTACK_AOE` actions**~~ — **Done 2026-04-20** (commit `072e820`). All attacks now go through `ActionType.SPELL` + SpellAsset. `Character.attackDamage` / `Enemy.attackDamage` removed as they had no remaining callers.
- ~~**Fix: pierce fails on enemies sharing enemyId**~~ — **Done 2026-04-20** (commit `024090a`). Dedup now uses array index via `hitEnemyIndices`.
- ~~**Fix: bolt hits through wall**~~ — **Done 2026-04-20** (commit `9285021`). `lastDist` formula on wall hit corrected + `pendingDeactivation` skip prevents bolts from advancing past walls on subsequent turns.
- ~~**Fix: game declares defeat while projectiles still in flight**~~ — **Done 2026-04-20** (commit `9285021`). `hasInFlightProjectile` check gates defeat conditions.
- ~~**Fix: reflected homing projectile freezes / doesn't damage caster**~~ — **Done 2026-04-20** (commit `b7959f2`). Homing reflected bolts now route back to caster using homing path style; `isHostileHit` accounts for reflection.

### Phase C progress (the big refactor — attempt 2 in progress)

Plan: [docs/projectile-refactor-plan.md](docs/projectile-refactor-plan.md). The goal is to move all VISUAL-annotated fields off `Projectile` into a `Map<string, ProjectileVisualState>` owned by `AnimatedGameBoard` so deep copies of `GameState` can't capture visual mutations.

| Phase | Status | Commit | Notes |
|---|---|---|---|
| A | ✅ Shipped April 2026 | `45fdf9d` | `ProjectileVisualState` type declared. |
| B | ✅ Shipped April 2026 | `af55a53` | Movement branches extracted into helpers. |
| **C-1** | ✅ Shipped 2026-04-20 | `48f8549` | `visualPastReflectPoint` moved to side-table. Scaffolding + pattern established. |
| **C-2** | ✅ Shipped 2026-04-20 | `ab45367` | `x`/`y` removed from Projectile. New `logicalX`/`logicalY` fields hold the authoritative turn-boundary position; visual interpolation lives in the side-table entry. ~30 callsite edits across simulation.ts / Game.tsx / actions.ts / AnimatedGameBoard.tsx / types/game.ts. 235 tests / 42 goldens unchanged. |
| **C-3** | ✅ Shipped 2026-04-20 | — | Per-frame `currentTileIndex` visual write removed from `updateTileBasedVisual`; visual progress now flows through `ProjectileMovementResult.visualTileIndex` and is mirrored into the side-table by `updateProjectiles`. `startTime` / `tileEntryTime` / `homingVisualStart*` reclassified BRIDGE after confirming no per-frame writes exist — safe on Projectile (only written at turn boundaries, so deep copies capture correct values). 235 tests / 42 goldens unchanged. |

**Corpus safety net:** `src/engine/__tests__/corpus/` has 21 cases × 2 modes (real + headless) = 42 goldens. Tests run in <1s. Every logical projectile behavior you might break is locked in. `npm test` is the check. `UPDATE_GOLDENS=1 npm test -- corpus` regenerates when behavior intentionally changes.

**Phase C attempt 1 retro (2026-04-19) — READ THIS BEFORE ATTEMPTING C-2.**

The plan doc specifies: *"Add a non-serialized `Map<string, ProjectileVisualState>` to `AnimatedGameBoard` component state (or to a ref — not to `GameState`)."* The attempt deviated from this. Instead of a component-scoped ref, it used a **module-level singleton map** — motivated by wanting to avoid prop-drilling through simulation.ts, actions.ts, Game.tsx, and AnimatedGameBoard (visual fields are written in 5 places).

That deviation was the root problem. The singleton's lack of ownership boundaries caused:
- `initializeGameState` had no natural way to know "is this a new puzzle or a mid-game reset?" — it called `resetAllVisualStates()` which wiped the global map. With 20+ call sites (game load, reset, retry, solver, replay, editor test modes, victory/defeat handlers), some fired mid-turn and killed live projectiles' visual-state entries. Projectiles then rendered at the default `(0, 0)` after a synthetic `setVisualState` call in the per-frame sync step.
- The replay system creates projectiles outside the normal spawn path; those bypassed `initVisualState` and hit a required-field assertion that crashed the app.
- The per-frame "sync struct → map" scaffolding added for the migration couldn't cleanly distinguish "logical position after resolveProjectiles" from "visual interpolation value," so fixes kept moving the bug.
- The straight-line anchor-reset logic (separate bug, latent pre-Phase-C) snapped visuals near the target on each turn boundary. Discovered via diag tooling added for Phase C. Per-frame seek fix was shipped mid-attempt but got reverted with the rest.

**Learnings to apply for C-2 and beyond:**
- **The plan's "map inside AnimatedGameBoard" choice has a real reason.** React component lifecycle gives the side-table natural ownership boundaries: one board instance = one map, unmount clears it, no cross-game bleed. **Don't deviate from the plan's architectural choices without strong evidence they're wrong; "avoids some prop-drilling" is weak evidence.** Phase C-1 accepted the prop-drilling — pass `projectileVisualStateRef.current` into `getHomingTargetGlow`, `drawProjectile`, and `updateProjectiles`. Same pattern for C-2.
- **Mid-turn resets are a real threat.** Anything outside `GameState` needs to survive `initializeGameState` being called from 20+ code paths, some reentrantly. The React-scoped ref dodges this entirely. **Don't add "reset visual state" code in simulation.ts** — the ref's lifecycle is owned by the component.
- **Corpus first.** Attempt 1 didn't have it; attempt 2 (in progress) does. Every C-2 step: run `npm test`, expect 235 passing with 42 goldens unchanged. Pure refactors shouldn't change any golden.
- **Logic-to-visual signals flow as return values.** The visual helpers return `ProjectileMovementResult` which now includes `pastReflectPoint?: boolean`. For C-2, the helpers already return `newX, newY` — that's the signal. The caller writes to the map. Simulation code does NOT write to the map directly.
- **Straight-line homing fix is a separate, low-risk visual-only change.** Can ship independently. Low priority.

### Won't-do (decided)

- **Native-resolution rendering Phase 2 (game board), and Phase 3 / Phase 4 with it.** Attempted on 2026-04-17 (commit `f2de97f`), reverted same day (commit `257c50b`). The "shrink the canvas buffer + CSS-upscale" approach is incompatible with the per-sheet `scale` and fractional `sprite.size` knobs the board needs for cross-sheet entity normalization. See [docs/native-resolution-rendering-plan.md](docs/native-resolution-rendering-plan.md) Phase 2 section for full reasoning. Don't reattempt without revisiting that doc.

### Recently completed (April 21, 2026 — playtest pass: replay + homing + duplicates)

Long playtest session. Touched four largely-independent bug classes, closed all known issues, verified on live gameplay. All tests green throughout (237 passing, 44 corpus goldens, regenerated 4 times for intentional behavior changes).

**Replay UX (first half of session).**
- **Step-forward over-animated by 4× for slow bolts.** `stepDuration = 800/speed * 4` (= 3200ms at speed 1) let `updateTileBasedVisual` advance `visualTileIndex` 4 tiles instead of 1, so slow projectiles visually landed on an earlier turn than they logically hit. Auto-play used `TURN_INTERVAL_MS` (one turn) and was correct. Fixed step-forward to use `TURN_INTERVAL_MS` too — now auto-play, step-forward, and the bolt's logical arrival turn all agree. ([Game.tsx:1285](puzzle-game/src/components/game/Game.tsx:1285))
- **Step-back replayed the turn's animation.** Step-back called `resetReplayProjectilesToTurnStart` and started a new animation window, which (a) repeated the turn's motion and (b) inherited the same 4× over-animation bug. Changed step-back and seek to *skip* the per-turn-start reset and the animation window entirely — they jump straight to each turn's end-of-turn state (what `buildReplayProjectiles` already computes) and freeze. Matches media-scrubber UX. ([Game.tsx:1294](puzzle-game/src/components/game/Game.tsx:1294))
- **Frozen-replay projectiles rendered at stale visual-state positions.** `updateProjectiles` doesn't run while `replayFrozen=true`, so the side-table can't refresh. `drawProjectile` preferred `vs.x/y` over `proj.logicalX/Y` even when stale. Added a `replayFrozen` param to `drawProjectile`: when frozen, always read from `logicalX/Y`; when animating, trust `vs` since `updateProjectiles` keeps it fresh. ([AnimatedGameBoard.tsx:3801](puzzle-game/src/components/game/AnimatedGameBoard.tsx:3801))
- **Step-forward snap-back when frozen kicked in.** `resetReplayProjectilesToTurnStart` overwrote `logicalX/Y` back to the turn-*start* position so the animation could play forward. Once the window closed, `drawProjectile` (now in frozen mode) read the turn-start logical and snapped the bolt back. Removed the `logicalX/Y` overwrite — `buildReplayProjectiles` already sets it to the turn-*end* position, which is what frozen state should show. ([Game.tsx:1242](puzzle-game/src/components/game/Game.tsx:1242))

**Straight-line homing visual (second half of session).**
- **Bolts "appeared near target" on spawn with slow projectiles.** Cause: the MOVE TOWARD branch re-anchored `homingVisualStartX/Y` to the post-turn logical position on *every* turn, including the spawn turn. Since `resolveProjectiles` runs in the same `executeTurn` as `spawnProjectile` with no frames between, the spawn-turn re-anchor wiped `visStart=caster` before any frame rendered. Skip the re-anchor on the spawn turn (`proj.spawnTurn === gameState.currentTurn`). Subsequent-turn re-anchoring still happens for slow-projectile moving-target support. ([simulation.ts:3523](puzzle-game/src/engine/simulation.ts:3523))
- **Moving-target bolts trailed by a tile.** REACHED TARGET branch wasn't updating `proj.targetX/Y` to the hit point, so `updateStraightLineHomingVisual` kept interpolating toward the spawn-time target position. Added the target update. ([simulation.ts:3548](puzzle-game/src/engine/simulation.ts:3548))
- **Jitter at turn boundaries on moving-target chases.** Re-anchoring `visStart` to `newLogical` caused the visual to snap from its current interpolated position to logical. Changed the re-anchor to set `visStart` to the *current visual position* via a new `currentStraightLineHomingVisualPos` helper — the new trajectory continues smoothly from where the bolt actually is. Applied to both MOVE TOWARD and REACHED TARGET. Critical ordering: compute visual position *before* mutating `targetX/Y`, since the helper uses current target to reconstruct position. ([simulation.ts:2080](puzzle-game/src/engine/simulation.ts:2080))

**Grid-homing visual.**
- **Freeze at end of each turn for speed ≥ 2.** `tileTransitTime = 1/speedTilesPerSecond` (constant per-tile duration) combined with Chebyshev-stepped `getTilesAlongLine` paths (diagonal steps cover less tile-count than Euclidean distance) meant the animation completed before the turn did. For homing bolts whose `tilePath` is rebuilt per-turn, pace the whole path to exactly one turn interval (800ms) instead: `tileTransitTime = 0.8 / (tilePath.length - 1)` when `proj.isHoming`. Non-homing tilePaths are full-flight, keep per-tile pacing. ([simulation.ts:2195](puzzle-game/src/engine/simulation.ts:2195))
- **Projectile jumped back 1 tile at each turn boundary.** `getTilesAlongLine` uses `Math.round` for the end tile but `safeFloor` for the start tile. Turn N ends at `Math.round(logical)` but turn N+1 starts at `safeFloor(logical)` — for any fractional logical with `>= 0.5` component, these differ by 1. Rounded the logical coords when building the start of the new tilePath. Applied to both MOVE TOWARD and REACHED TARGET branches for grid and pathfinding homing. ([simulation.ts:3451, 3560](puzzle-game/src/engine/simulation.ts:3451))

**Duplicate-enemyId targeting (the big one).**
- **Heroes targeted by placement order, not proximity.** Root cause: several sites looked up the homing target by `.find(e => e.enemyId === id)`, which always returns the first enemy in array order when duplicates exist. `findNearestEnemies` correctly picked the closest instance, but `spawnProjectile` and `resolveProjectiles` both overrode to enemies[0]. Added `targetEnemyIndex` to `HomingTarget` and `Projectile`; populated it throughout (findNearestEnemies tracks the original array index, HomingTarget carries it through `executeSpellInDirection` to `spawnProjectile`, stored on Projectile, preferred by `resolveProjectiles` and `spawnProjectile` lookups over the `.find()` fallback).
- **`findNearestEnemies` and `findNearestCharacters` didn't filter `pendingProjectileDeath`.** A second bolt fired the same turn as the killing shot would pick the pending-death entity as target; then `resolveProjectiles` (which *does* exclude pendingDeath) would fall back to `.find()` and redirect the bolt to a different instance mid-flight. Added the filter to both functions. ([actions.ts:3071, 3155](puzzle-game/src/engine/actions.ts:3071))
- **Win declared with an enemy visibly alive + bolts stuck forever on same "dead" target.** Coupled bug with subtle cause: for downgraded non-homing bolts, `walkNonHomingTick` walks in `proj.direction` (= `character.facing`) while `tilePath` was built by `computeTilePath(caster, clampedTarget)`. These trajectories diverge. When the walker hit an enemy at a logical tile index beyond tilePath's length, `hitResult.hitTileIndex` exceeded `tilePath.length - 1`. Visual check `currentTileIdx >= hitTileIndex` never fired → bolt lived forever, enemy stuck in `pendingProjectileDeath`. `checkVictoryConditions` treats pendingDeath as dead, so the game declared victory with a visually-alive enemy. Two fixes applied:
  - Clamp `hitTileIndex` to `tilePath.length - 1` in hostile_hit and healing_hit steps (safety net). ([simulation.ts:3765](puzzle-game/src/engine/simulation.ts:3765))
  - **Root fix**: align downgraded bolt target with `character.facing × range` instead of scaling toward the unreachable target. Now walker and tilePath follow the same trajectory, VFX at walker's hit tile matches visual endpoint, no mismatch possible. Nice emergent behavior: downgraded bolts become opportunistic linear attacks that can still hit enemies who walk into their path. ([actions.ts:1757](puzzle-game/src/engine/actions.ts:1757))
- **Healthbar homing-target glow issues.**
  - Previously restricted to `homingPathStyle === 'straight'` — grid and pathfinding bolts never glowed. Removed the style check. ([AnimatedGameBoard.tsx:2782](puzzle-game/src/components/game/AnimatedGameBoard.tsx:2782))
  - Matched by `targetEntityId` only, so all same-id duplicate enemies lit up together. Added an optional `enemyIndex` param; when both `proj.targetEnemyIndex` and `enemyIndex` are defined, require exact match.
  - Downgraded bolts (`isHoming=false`) didn't glow even though the cast was intentionally homing. Preserve `targetEntityId`/`targetIsEnemy`/`targetEnemyIndex` on the projectile from the `homingTarget` param regardless of downgrade; glow gates on `proj.targetEntityId` instead of `proj.isHoming` (still only true for originally-homing casts since non-homing spells never pass `homingTarget`).

**Other.**
- Replay visual-state reseed quirk (listed as pending in prior handoff) is effectively resolved by the frozen-state drawProjectile change — when frozen reads `logicalX/Y` directly, stale `vs` entries don't matter.
- Infinite-crawl fix for slow homing bolts chasing moving targets — changed out-of-range threshold from `remainingRange <= 0` to `remainingRange < 0.5`. Without this, a bolt's Euclidean `traveled` grows asymptotically as it closes on a target whose path bends, leaving tiny fractions of remainingRange; clampedMove rounds to the same tile each turn and the bolt freezes visually forever. ([simulation.ts:3416](puzzle-game/src/engine/simulation.ts:3416))

**Debug infrastructure left in place.** `HOMING_DEBUG` flag in `simulation.ts:14` (exported). All the diagnostic logs from this session are gated on it — `[HOMING-SPAWN]`, `[HOMING-TARGET]`, `[HOMING-RESOLVE]`, `[PROJ-VISUAL-TILE]`, `[PROJ-HIT-CONSUME]`, `[PROJ-NONHOMING-RESOLVE]`, `[DEATH-MUT]`, `[WIN-CHECK]`. Flip to `true` next time a projectile regression needs tracing.

### Recently completed (April 20, 2026 — late-evening session, projectile bug sweep)

Seven commits, all green on main.

- `Fix: hitIdx ReferenceError in replay projectile reconstruction` ([9b75c8f](https://github.com/Jantzulu/puzzle-daily/commit/9b75c8f)). Classic scoping bug in `buildReplayProjectiles` — hitIdx declared inside the hit branch but referenced in the wall_hit/deactivate branch, crashed any replay whose last event wasn't a hit.
- `Refactor (Phase C-3): finish projectile visual-state migration` ([7881e15](https://github.com/Jantzulu/puzzle-daily/commit/7881e15)). Last per-frame visual write (`proj.currentTileIndex` in `updateTileBasedVisual`) moved off Projectile. Remaining anchor fields (`startTime`, `tileEntryTime`, `homingVisualStart*`) reclassified BRIDGE — they're only written at turn boundaries, so deep copies capture correct values. Phase C officially complete.
- `Fix: projectiles invisible during replay playback` ([e7aca27](https://github.com/Jantzulu/puzzle-daily/commit/e7aca27)). Step handlers were resetting projectiles to `_turnStartTileIndex` so the animation plays forward; playback and seek weren't doing the same reset, so projectiles loaded at end-of-turn `currentTileIndex` and `updateProjectiles` immediately consumed the `hitResult` — removing the sprite before it rendered. Extracted `resetReplayProjectilesToTurnStart` and applied to all three paths.
- `Fix: homing projectiles ignore spell range after turn 1` ([b4644d3](https://github.com/Jantzulu/puzzle-daily/commit/b4644d3)). Homing range gate measured from `homingVisualStartX/Y` — which re-anchors each turn for slow-projectile visual interpolation — so the measured distance was always ~0 and the range gate never fired. Switched to the stable `proj.startX/Y`. Added corpus case 22.
- `Feature: restore wall bouncing for LINEAR projectiles` ([9cf21e8](https://github.com/Jantzulu/puzzle-daily/commit/9cf21e8)). Wall bouncing was fully implemented at commit `8b049df` (Jan 2026) and silently dropped by the March deterministic refactor — only the config fields carried over, the collision code didn't. Restored in `walkNonHomingTick` with a `bounce` step that mutates `proj.direction`/`startX/Y`/`logicalTileIndex=0`/`bounceCount++` and continues the walk in the same turn budget. Deterministic modes live (`reflect` / `turn_around` / `turn_left` / `turn_right`); `random` falls through to a normal wall hit until someone wires up a seeded PRNG.
- `Fix: out-of-range homing bolts spawn from wrong visual positions` ([a466f04](https://github.com/Jantzulu/puzzle-daily/commit/a466f04)). `updateStraightLineHomingVisual` interpolates to the target over `dist/speed` seconds — for a 7-tile target at speed 4 that's 1.4s vs the 0.8s turn, so the sprite reached ~57% while logical was range-capped at ~43%. Turn-boundary anchor reset then snapped the sprite backward, producing the "projectiles appearing at random locations" visual the user reported. Fix: at spawn in `spawnProjectile`, if the homing target is beyond spell range, downgrade to a non-homing straight bolt aimed at the max-range point in the target's direction. Clean fizzle, no teleport.

### Recently completed (April 20, 2026 — Phase C-3, Phase C done)

- `Refactor (Phase C-3): finish projectile visual-state migration`. Last per-frame write to `proj.currentTileIndex` removed from `updateTileBasedVisual`; the helper now returns `visualTileIndex` through `ProjectileMovementResult`, and `updateProjectiles` mirrors it into the side-table and reads from there for hitResult timing. `startTime`, `tileEntryTime`, and `homingVisualStart{X,Y,Time}` audited and reclassified **BRIDGE** — they are only written at turn boundaries (spawn + reflect), so deep copies of GameState capture correct values. Left on `Projectile` with updated docstrings rather than migrating, per the handoff's own "candidate for live-with-it" guidance. `ProjectileVisualState` interface trimmed: only x/y/startTime/currentTileIndex/visualPastReflectPoint remain (the fields that are actually mutated per-frame or signal-stable). 235 tests / 42 goldens unchanged. Phase C is now complete.

### Recently completed (April 20, 2026 — late session, Phase C-2)

- `Refactor (Phase C-2): migrate projectile x/y to side-table` (commit `ab45367`). Removed `x` and `y` from the `Projectile` type entirely. Added `logicalX`/`logicalY` for turn-boundary authoritative position; visual interpolation now lives in the `projectileVisualStateRef` map owned by AnimatedGameBoard. Four sub-steps with tests between each: (1) add fields + seed at spawn + shadow-write at logical sites + switch logical reads, (2) remove shadow writes from logical paths, (3) route visual writes/reads through the side-table — `updateGridHomingVisual` takes currentX/Y as params, `drawProjectile` reads from map with `logicalX/Y` fallback, (4) delete `x`/`y` from the type. Corpus 235 / 42 unchanged; tsc diff is line-number shifts only. Classification insight that shaped the approach: `proj.x/y` was dual-role (logical at turn boundary, visual during flight); homing position isn't derivable from `startX + dx * logicalTileIndex` so needed a dedicated logical field.

### Recently completed (April 20, 2026 session — big one)

Fourteen commits. Phase E landed complete, Phase D started, Phase C attempt 2 kicked off (C-1 done), five real bug fixes, one legacy-code removal. Tests: 235 passing throughout, 42 corpus goldens locked in, no unit-test regressions.

**Test infrastructure (previous session, landed this window):**
- Golden-test corpus shipped (commit `961bca1`). `src/engine/__tests__/corpus/` with 21 cases exercising every projectile path — LINEAR fast/slow, three homing path styles, reflect × homing variants, pierce (same + distinct enemyIds), bounce, two-heroes simultaneous cast. 42 goldens (real + headless per case).

**Bug fixes:**
- `Refactor: remove legacy ATTACK_FORWARD / ATTACK_RANGE / ATTACK_AOE actions` (commit `072e820`). All attacks go through the spell system now. `Character.attackDamage` and `Enemy.attackDamage` fields removed; `archer.json` deleted (only consumer). ~188 lines removed.
- `Fix: pierce now hits all enemies sharing an enemyId` (commit `024090a`). Dedup switched to array-index via `hitEnemyIndices` (field existed for this case but wasn't populated). Affects real-world puzzles since same-id enemy stacks are common. Fifteen corpus goldens updated to reflect the new tracking format.
- `Fix: projectile wall-stop + don't defeat while bolts are in flight` (commit `9285021`). Two bugs, one commit. `logicalTileIndex` no longer advances past the wall tile on wall hits; defeat check gates on `hasInFlightProjectile` so slow bolts fired on last-active turn can still land.
- `Fix: reflected homing projectile tracks back to and damages caster` (commit `b7959f2`). Two sub-bugs: reflected straight-line walk went wrong direction for homing (now uses homing path style), and `isHostileHit` misclassified reflected hits as heals (now ORs `proj.reflected`). Real and headless produce byte-identical final state for these cases — **beyond** Phase E's outcome-parity target.

**Phase E (complete):**
- `Refactor (Phase E1): extract resolveReflectedPathHeadless helper` (commit `0c88664`). Intra-function dedup — two identical ~50-line inline blocks in `updateProjectilesHeadless` extracted.
- `Refactor (Phase E2): merge reflect-path walk between real and headless` (commit `26fabcb`). `walkReflectedPath` + thin wrappers `resolveReflectedPath` (real) and `resolveReflectedPathHeadless` (headless). Step-log pattern introduced: helper emits travel/wall/hit steps; each mode's wrapper translates.
- `Refactor (Phase E3): merge non-homing tile loop between real and headless` (commit `8ece3e5`). Biggest slice. `walkNonHomingTick` is now the shared walker; both functions are thin step-log consumers. Drift between solver and live game is structurally impossible in these paths.

**Phase D:**
- `Refactor (Phase D-a): fold pendingDeactivation into hitResult` (commit `4f9076d`). Two bridge flags unified into one. All range-end deactivations now go through `hitResult = { hitTileIndex, deactivate: true }`. Pure refactor, 0 golden changes.

**Phase C attempt 2 (in progress — see Phase C progress section):**
- `Refactor (Phase C-1): migrate visualPastReflectPoint to side-table` (commit `48f8549`). First field migrated off Projectile. Pattern established: `useRef<Map>` in AnimatedGameBoard, helpers signal via return values, callers write to map, rendering reads from map. C-2 (x/y) and C-3 (anchors) follow the same pattern.

**Open follow-up spawn tasks** (chips still available in spawn-task list):
- Implement wall bouncing feature (never implemented, not a bug)
- Fix homing-trigger-range + disappearing projectile visuals (user-reported mid-session)

### Recently completed (April 19, 2026 session)

Non-Phase-C wins shipped this session, all still on main after the Phase C revert:
- **`puzzle_completions` 400 error closed** (commit `07665f8`). Not a schema mismatch — the 10s rate-limit trigger from migration 005 was raising on legit fast-retry players. Client swallows `P0001` rate-limit in `submitCompletion`; migration `010_silent_completion_rate_limit.sql` converts the trigger to silently `RETURN NULL`. Migration 007 trigger creation made idempotent. **Needs deploy:** apply 007 + 010 to Supabase.
- **`handleNewPuzzle` crash fixed** (commit `2a4e2b3`). Missing `tags`, `description`, `isTraining`, `maxPlaceableCharacters`, `backgroundMusicId` in the state replacement; save path hit `state.tags.length` on undefined. Init them to empty defaults.
- **`findNearestEnemies` ternary fixed** (commit `d034f0b`). Hero-fired `autoTargetNearestEnemy` was never acquiring targets. Ternary `casterIsCharmed ? !casterIsEnemy : casterIsEnemy` was inverted; should be `casterIsCharmed ? casterIsEnemy : !casterIsEnemy` (XNOR). Pre-existing bug — enemies firing at heroes worked because they go through the sibling `findNearestCharacters` plus a `tempCharForTrigger` wrapper that strips `enemyId`, which happened to produce correct behavior.
- **Pathfinding-homing wall-block fix** (commit `6f3144c`). The "don't ignore walls" check ran a straight-line wall test even for `homingPathStyle: 'pathfinding'`, causing the projectile to deactivate at the first wall before the pathfinder could route around it. Skip the straight-line check for pathfinding mode.
- **Audit item closed**: `puzzleGenerator.ts` `Math.random()` re-verified as editor-only (commit `07665f8`). No runtime determinism risk.
- **Sentry env vars** set on both Netlify sites (user action, code already handled missing DSN).

### Recently completed (April 17, 2026 session)

- **Tier 1 determinism fixes** (audit follow-up): removed `Math.random()` gate on status effect `applyChance` (commit `7590223`) — live gameplay is now fully deterministic with respect to status effects. Fixed the syncTracker push/edit race (commit `7f9d3a7`) — concurrent edits during sync no longer get silently dropped.
- **Audit summary doc** [docs/audit-summary.md](docs/audit-summary.md) — living roadmap of outstanding work.
- **Netlify config cleanup** — removed repo-level `netlify.toml` (was silently overriding player site settings), each site now configured in its own dashboard. Dev site: `npm ci && npm run build` → `dist`. Player site: `npm ci && npm run build:player` → `dist-player`.
- **Dead code removal** — deleted `CloudSyncPanel.tsx` (superseded), cleaned ~13 unused CSS classes.
- **Card rendering rework** — hero/enemy cards in CharacterSelector and EnemyDisplay now use the new `pixelScale`/`fillWidth` rendering with aligned HP rows via name-block min-height measurement.

## Important Patterns

- **Deep copy issue (largely resolved by Phase C)**: `setGameState((prev) => { const copy = JSON.parse(JSON.stringify(prev)); executeTurn(copy); return copy; })` deep-copies GameState, historically capturing visual mutations from `updateProjectiles`. Phase C moved the per-frame-mutated visual fields (`x`, `y`, `currentTileIndex`, `visualPastReflectPoint`) into a side-table (`projectileVisualStateRef` in AnimatedGameBoard) that lives outside GameState. `resolveProjectiles` still uses `logicalTileIndex` (authoritative, deterministic) rather than `currentTileIndex`; the latter is now a turn-boundary LOGICAL field written only by logical paths.
- **Axiom**: Visuals must represent reality. The game is a puzzle - players plan based on what they see. Visual/logic mismatches are bugs, not cosmetic issues.
- **Determinism**: Same puzzle setup must produce the same result every run. The `resolveProjectiles` system at turn boundaries achieves this. Frame timing should never affect game outcomes.
- **Safe revert point**: Commit `e3b5b58` is the pre-deterministic state where everything worked visually (per-frame collision) but had rare frame-timing variance. Can always revert there if needed.

## Historical Session Summary (March 20-24, 2026)

Major work done:
- Deterministic projectile system (`resolveProjectiles`)
- Reflect status effect (directional filter, combined visual path, tint switching, VFX)
- Redirect spell system (all modes, player-choosable direction, collectible/tile variants)
- Steadfast status effect (immune to redirects)
- Stealth status effect (trigger/targeting immunity)
- Homing projectile path styles (straight/grid/pathfinding, wall ignore, hit along path)
- Health bar glow for homing targets
- Projectile scale control in spell editor
- Initial status effects on entities
- Backstab system (per-spell, critical hit sprite)
- Replay event timeline system
- Spell link navigation from behavior editor
- Entity usage badges on spell cards
- Touch drag reordering for mobile
- Rich spell/status info in behavior and status effect pickers
- Multiple projectile/reflect bug fixes
