# Claude Handoff Document - Puzzle Daily

Last Updated: April 17, 2026

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
- `pendingDeactivation` flag replaces `active = false` for end-of-range, letting the visual system control deactivation timing.
- `pendingProjectileDeath` defers entity death until the projectile visual arrives. `visualHealth` defers HP bar changes similarly.

**Known issues / pending work:**
- Slow homing projectiles (speed 1-2) have visual issues - they do not smoothly track moving targets. The straight-line interpolation was designed for fast projectiles. Attempts to fix (per-frame following, cumulative distance) broke fast projectiles. The slow homing fix needs a separate visual path that does not affect fast projectiles.
- Replays show projectiles via an event timeline system (`projectileTimeline` in Game.tsx). Events are recorded during headless replay generation. `buildReplayProjectiles()` reconstructs projectile visuals from events. Step-by-step replay works with animation + freeze. Some edge cases remain with slow projectiles in replays.
- The projectile system has technical debt: multiple overlapping flags (`pendingDeactivation`, `pendingProjectileDeath`, `hitResult`, `visualHealth`), duplicated collision logic between `resolveProjectiles` and `updateProjectilesHeadless`, and the visual system still mutates `proj.x/y` and `proj.currentTileIndex` on game state objects (deep copy captures these).

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

### Tracked refactors (see docs/ for detailed plans)

1. **Projectile system refactor — Phases C, D, E** (pending; C attempt reverted 2026-04-19).
   Plan: [docs/projectile-refactor-plan.md](docs/projectile-refactor-plan.md).
   Phases A (ProjectileVisualState type introduced, commit `45fdf9d`) and B (movement branch extraction, commit `af55a53`) shipped April 2026.

   **Phase C attempt 1 (2026-04-19) — reverted.** The plan doc specifies: *"Add a non-serialized `Map<string, ProjectileVisualState>` to `AnimatedGameBoard` component state (or to a ref — not to `GameState`)."* The attempt deviated from this. Instead of a component-scoped ref, it used a **module-level singleton map** — motivated by wanting to avoid prop-drilling through simulation.ts, actions.ts, Game.tsx, and AnimatedGameBoard (visual fields are written in 5 places).

   That deviation was the root problem. The singleton's lack of ownership boundaries caused:
   - `initializeGameState` had no natural way to know "is this a new puzzle or a mid-game reset?" — it called `resetAllVisualStates()` which wiped the global map. With 20+ call sites (game load, reset, retry, solver, replay, editor test modes, victory/defeat handlers), some fired mid-turn and killed live projectiles' visual-state entries. Projectiles then rendered at the default `(0, 0)` after a synthetic `setVisualState` call in the per-frame sync step.
   - The replay system creates projectiles outside the normal spawn path; those bypassed `initVisualState` and hit a required-field assertion that crashed the app.
   - The per-frame "sync struct → map" scaffolding added for the migration couldn't cleanly distinguish "logical position after resolveProjectiles" from "visual interpolation value," so I had to keep teasing apart which fields to sync. Each fix moved the bug.
   - The straight-line anchor-reset logic (separate bug, latent pre-Phase-C) snapped visuals near the target on each turn boundary. Discovered via the diag tooling I added for Phase C. A per-frame seek fix for that was shipped mid-Phase-C but got reverted with the rest.

   **Learnings — for attempt 2 and future refactors:**
   - **The plan's "map inside AnimatedGameBoard" choice had a real reason.** React component lifecycle gives the side-table natural ownership boundaries: one board instance = one map, unmount clears it, no cross-game bleed. The singleton workaround *looked* simpler (no prop-drilling) but cost more than it saved. **Don't deviate from the plan's architectural choices without strong evidence they're wrong; "avoids some prop-drilling" is weak evidence.**
   - **Mid-turn resets are a real threat.** Anything that lives outside `GameState` needs to survive `initializeGameState` being called from 20+ code paths, some reentrantly. The React-scoped ref dodges this entirely.
   - **Build the golden-test corpus first** (plan §4 Phase E precondition). This was explicitly on the plan; skipping it meant regressions were caught by play-testing, which is slow and non-deterministic. Synthetic corpus is fine — the goal is locking in current deterministic logical behavior.

   **Concrete starting points for attempt 2:**
   - Use `useRef<Map<string, ProjectileVisualState>>(new Map())` inside `AnimatedGameBoard`. Accept the prop-drilling (or pass the ref-current down through the visual helpers as a parameter).
   - Logic-to-visual signals (`reflectProjectile` resets, retarget anchor clears) should be **return values or explicit event objects from `resolveProjectiles`**, not writes into the side-table. That keeps the side-table visual-only.
   - **Straight-line homing fix is a separate, low-risk visual-only change.** The fix (per-frame seek: visual reads current position, steps `speed * dt` toward target each frame) is independent of the side-table refactor. Can ship it on its own before Phase C attempt 2 if desired.

   - **Phase D**: collapse the 6 overlapping deferred-state flags (`pendingDeactivation`, `pendingProjectileDeath`, `hitResult`, `visualHealth`, `pendingReflectVfx`, `visualPastReflectPoint`) into a coherent state machine. Scoped variant: consolidate just the reflect triad (`reflectAtTileIndex`, `pendingReflectVfx`, `visualPastReflectPoint`) as a ~20-callsite mini-D if full D is too big.
   - **Phase E** (highest determinism value): de-duplicate `updateProjectilesHeadless` (solver) and `resolveProjectiles` (real game) collision logic into a shared helper. Prevents solver/game drift. Requires a golden-test corpus of saved puzzles first.

2. ~~**`puzzleGenerator.ts` Math.random audit**~~ — **Done 2026-04-17**. Re-verified: only `GeneratorDialog.tsx` → `MapEditor.tsx` (editor-only). No runtime path. Output is persisted as a puzzle file and played deterministically. See [docs/audit-summary.md](docs/audit-summary.md) section 1. Precondition: if any future feature invokes the generator at runtime, switch to a seeded PRNG first.

### One-off tasks

3. **Slow homing projectile visuals** — speed 1-2 homing spells do not visually track moving targets well. Needs a separate visual approach for slow homing that does not break fast projectile behavior. Best tackled AFTER projectile Phase C (gives a cleaner place for a new visual code path).
4. **Replay projectile polish** — edge cases with slow projectiles, melee VFX timing.
5. ~~**Sentry environment variables**~~ — **Done 2026-04-18**. `VITE_SENTRY_DSN` and `VITE_SENTRY_ENVIRONMENT` set on both Netlify sites; client at [`sentry.ts`](src/lib/sentry.ts) no-ops without DSN, so nothing to verify code-side. Redeploy each site if env vars were added after the last build (Vite injects at build time).
6. ~~**Run `007_player_roles.sql` and `010_silent_completion_rate_limit.sql` migrations** against Supabase.~~ — **Done 2026-04-19.** Both deployed.
7. ~~**POST error on puzzle completion**~~ — **Done 2026-04-18**. Not a schema mismatch. Root cause: the `check_completion_rate_limit` trigger from migration 005 `RAISE EXCEPTION`s on the same (player, puzzle) inserting within 10s, which fires for legitimate fast-retry players. Fix: client swallows `P0001` rate-limit errors in `submitCompletion` ([`statsService.ts:118`](src/services/statsService.ts)); migration `010_silent_completion_rate_limit.sql` converts the trigger to silently `RETURN NULL`. Migration deployed 2026-04-19.

### Won't-do (decided)

- **Native-resolution rendering Phase 2 (game board), and Phase 3 / Phase 4 with it.** Attempted on 2026-04-17 (commit `f2de97f`), reverted same day (commit `257c50b`). The "shrink the canvas buffer + CSS-upscale" approach is incompatible with the per-sheet `scale` and fractional `sprite.size` knobs the board needs for cross-sheet entity normalization. See [docs/native-resolution-rendering-plan.md](docs/native-resolution-rendering-plan.md) Phase 2 section for full reasoning. Don't reattempt without revisiting that doc.

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
