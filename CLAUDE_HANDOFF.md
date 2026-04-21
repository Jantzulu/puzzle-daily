# Claude Handoff Document - Puzzle Daily

Last Updated: April 20, 2026

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
- **Wall bouncing (`bounceOffWalls`) was never actually implemented** — fields configured in spell editor, copied to Projectile, but no collision code consumes them. See spawn task.
- **Homing trigger range + disappearing visuals bug** — triggers with range > spell range still fire; projectile visuals disappear mid-flight. See spawn task.
- Projectile system still has remaining technical debt, but substantially reduced vs pre-April-20:
  - ✅ `pendingDeactivation` unified with `hitResult` (Phase D-a, commit `4f9076d`).
  - ✅ Collision logic deduplicated between `resolveProjectiles` and `updateProjectilesHeadless` via shared `walkNonHomingTick` / `walkReflectedPath` / `walkReflectedPathOnTiles` helpers (Phase E1/E2/E3, commits `0c88664`/`26fabcb`/`8ece3e5`).
  - ✅ `visualPastReflectPoint` moved to AnimatedGameBoard's visual-state side-table (Phase C-1, commit `48f8549`).
  - ⏳ Remaining visual fields still on Projectile: `x`, `y`, `startTime`, `currentTileIndex`, `tileEntryTime`, `homingVisualStartX/Y/Time`. Phase C-2 and C-3 below.
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

1. **Phase C-2: migrate `proj.x` and `proj.y` to the visual-state side-table.** The biggest remaining Phase C slice. See the **Phase C progress** section below for exact context (attempt 1 was reverted, attempt 2's Phase C-1 shipped 2026-04-20).

   **What's already set up (Phase C-1, commit `48f8549`):**
   - `AnimatedGameBoard.tsx` has a `projectileVisualStateRef = useRef<Map<string, ProjectileVisualState>>(new Map())`.
   - `updateProjectiles(gameState, visualState)` accepts the map and deletes entries for projectiles removed this frame.
   - Visual-update helpers (`updateStraightLineHomingVisual`, `updateGridHomingVisual`, `updateTileBasedVisual`, `updateLegacyNoPathVisual`) return `ProjectileMovementResult` with optional `pastReflectPoint: boolean`; the caller writes that into the map.
   - Pattern is proven end-to-end — the `visualPastReflectPoint` field is completely off Projectile, goldens unchanged.

   **What to do for C-2:**
   - Survey all reads of `proj.x` / `proj.y` across `src/engine/simulation.ts`, `src/engine/actions.ts` (spawn only), `src/components/game/Game.tsx`, and `src/components/game/AnimatedGameBoard.tsx`. **This is the key step.** Each read is either:
     - **Logical** — code that wants the projectile's current LOGICAL tile position (e.g. turn-boundary collision checks). These must switch to computing position from `proj.startX/startY + direction * logicalTileIndex` (already what some code does) or from the `tilePath[logicalTileIndex]`. **This is the bug class Phase C exists to fix — the old code sometimes read the mutating visual `x/y` when it wanted logical position.** Be ruthless here.
     - **Visual** — code that wants the interpolated position (rendering, VFX spawn points, homing distance checks). These read from the side-table.
   - Write sites: the four visual-update helpers currently `return { newX, newY, ... }` and the caller does `proj.x = newX; proj.y = newY;`. Replace with `visualState.set(proj.id, { ...existing, x: newX, y: newY })`.
   - Remove `x`/`y` from the `Projectile` type. They live only in `ProjectileVisualState` (already declared in `types/game.ts`).
   - `reflectProjectile` writes `proj.x = reflector.x; proj.y = reflector.y;` (line ~312). That's a logical position reset (the logical origin for the reflected leg), so it's fine as-is — or migrate to writing both logical and visual origins separately for clarity.
   - **Corpus is the safety net.** `npm test` must stay green at 235 passing throughout. Any golden change = stop and investigate.

   **What to beware of (this is the refactor that got reverted in attempt 1):**
   - **Don't deviate from the ref-based architecture.** Attempt 1 used a module-level singleton and it was the root of the revert. The retro below explains why.
   - **Mid-turn resets:** `initializeGameState` is called from 20+ places. The React-scoped ref is already the right container (unmount clears it). Don't add any "reset visual state" code in simulation.ts.
   - **Deep copies:** `setGameState(prev => JSON.parse(JSON.stringify(prev)))` captures everything on Projectile. Once `x`/`y` are off, the deep copy can't capture stale visual coordinates — that's the whole win. If any logical code still reads them post-migration, you'll see a TS error (good).
   - **Replay reconstruction** (`Game.tsx:buildReplayProjectiles` area) builds Projectile objects from timeline events. It currently sets `proj.x/y` when creating these; after C-2 that would move to seeding the visual map too. Check this path.

   **Estimate:** 1 focused session. Probably ~30–50 callsite edits plus the structural signature changes.

2. **Phase C-3: migrate remaining visual anchors.** After x/y, also move `startTime`, `currentTileIndex`, `tileEntryTime`, `homingVisualStartX/Y/Time` off Projectile via the same pattern. Each is smaller than x/y. Can land as one commit or three small ones.

3. **Phase D-b (optional): consolidate the entity-owned deferred-visual pair.** `pendingProjectileDeath` and `visualHealth` live on PlacedCharacter/PlacedEnemy and coordinate "entity is logically dead/damaged but visual hasn't caught up." They aren't purely bridge flags — `pendingProjectileDeath` is read elsewhere to skip dying entities for targeting — so this is a semantic change, not just a rename. Consider deferring until after C-3 when the visual side of projectiles is cleaner.

### Open spawn tasks (deferred bugs / features)

4. **Implement wall bouncing for LINEAR projectiles.** Feature never implemented; `bounceOffWalls`, `maxBounces`, `bounceBehavior`, `bounceTurnDegrees` are configured in the spell editor and copied to Projectile but no collision code consumes them. Corpus case `14-linear-bounce-walls` currently locks in the buggy behavior (bolt freezes at pre-wall tile) — when implemented, regenerate that golden. Implementation hook: `walkNonHomingTick` in simulation.ts. On wall hit, check `proj.bounceOffWalls && bounceCount < maxBounces`, compute new direction per `bounceBehavior`, increment `bounceCount`, reset `proj.startX/Y` to pre-wall tile, continue walk. Emit a `bounce` step in the step log so callers can build Z-shaped tilePaths (real) and record timeline events (headless). Respect `reflectProjectile`'s disable at line 255. Medium complexity.

5. **Fix: homing trigger range bypasses spell range + projectile visuals disappear.** User-reported bug from 2026-04-20 session. When an entity has a trigger like "enemy in range: 8" that fires a homing spell with smaller `attackData.range` (e.g. 3), the spell still hits the enemy at distance 8 — should either gate firing or self-terminate mid-flight. Additionally, projectile sprite disappears during flight. Two distinct symptoms, same scenario. Likely culprits: range-enforcement in `resolveProjectiles` homing branch (around `remainingRange <= 0` check), trigger-fired spell spawn path possibly bypassing range validation, and the visual loop may be setting pendingDeactivation with a sprite state that doesn't render. Consider adding a corpus case to reproduce before fixing.

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
| **C-2** | ⏳ Next | — | Migrate `proj.x` and `proj.y`. See "Next session — start here" above for detailed playbook. |
| **C-3** | ⏳ Pending | — | Migrate `startTime`, `currentTileIndex`, `tileEntryTime`, `homingVisualStartX/Y/Time`. |

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

- **Deep copy issue**: `setGameState((prev) => { const copy = JSON.parse(JSON.stringify(prev)); executeTurn(copy); return copy; })` - the deep copy captures visual mutations from `updateProjectiles`. This is why `resolveProjectiles` uses `logicalTileIndex` (not `currentTileIndex`) and why reflected projectiles are skipped on subsequent turns.
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
