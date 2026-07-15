# Claude Handoff Document - Puzzle Daily

Last Updated: July 14, 2026, third session (MAP EDITOR REDESIGN COMPLETE — Phase 1 decomposition, Phase 2 layout rework, Phase 3 interaction gestures + mobile, all user-approved along the way, dungeon-theming pass CANCELLED by the user; plus 2 new theme fonts. See "Recently completed (July 14, third session)". Earlier the same day: HIT-STAMP CONDITIONS closed out the trigger overhaul — that whole batch still AWAITS USER TESTING on deploy. NOTE: the July 1–12 work — engine audit sweeps 1–10, summon/necromancy/vessels, Phase E homing helpers, strafe actions, contact redesign — is chronicled in the user-memory `in-progress.md`, not here; this doc's session log resumes at June 30 below.)

## Doc Map — Where to Find What

| Artifact | Location | Purpose |
|---|---|---|
| **Project status / handoff** | `CLAUDE_HANDOFF.md` (this file) | Architecture, conventions, pending tasks, recent session log. Read first when starting a new session. |
| **Approved feature roadmap** | `~/.claude/projects/.../memory/feature-roadmap.md` (user memory) | Formally approved features, shipped + outstanding. Categorized by priority. The curated list. |
| **Captured-in-the-wild backlog** | `docs/feature-backlog.md` | Raw ideas + bug observations as they come up, triaged into tiers (launch-blocking → launch-adjacent → post-launch). New items land here; graduate to roadmap when scoped. |
| **Deferred plan: offscreen sprite cache** | `docs/offscreen-sprite-cache-plan.md` | The biggest perf lever still on the table. Documented but blocked on validation infra (dual-render diff harness). Pick up when mobile perf becomes a bottleneck. |
| **Completed plan: projectile refactor** | `docs/projectile-refactor-plan.md` | COMPLETE — all phases shipped or resolved (D-b rejected, see "Phase D-b lite" below). Two low-value residual divergences remain documented under its Phase E section. |
| **Won't-do: native-resolution rendering** | `docs/native-resolution-rendering-plan.md` | Phase 2 reverted; reasoning preserved so it's not reattempted naively. |
| **Determinism / audit summary** | `docs/audit-summary.md` | Living roadmap of determinism + audit work. |
| **Player app vision/architecture** | `docs/PLAYER_APP_VISION.md`, `docs/PLAYER_APP_ARCHITECTURE.md` | Player site separation reference. |
| **Per-topic memory files** | `~/.claude/projects/.../memory/*.md` | Point-in-time observations and decisions (per-feature notes, user preferences, security practices). MEMORY.md is the index. |

**How items flow:** `feature-backlog.md` items get triaged → graduated to `feature-roadmap.md` (or just done & crossed off) → notable session work logged at the bottom of this handoff under "Recently completed".

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

**MOBILE RENDER PERF (profiled on-device 2026-07-15 — JS EXONERATED, awaiting round-2 numbers).** The user's phone shows jitter on a SIMPLE level at DPR 2. History: July-15 cheap wins shipped (gradient caches, vignette bake, atmosphere toggle), user bisected via the ⚡ Effects tab — no toggle changed smoothness. This session built the **frame profiler HUD** (`?perf=1` / Effects tab / `togglePerfHud()`; `frameProfiler.ts`, marks in AnimatedGameBoard's animate loop; commit `845019d`) because the test iPhone can't be remote-profiled from Windows.

**Round-1 result (user's iPhone 15 Pro, deployed site, canvas 624×720 dpr2 zoom3, 48fps):** the ENTIRE animate loop costs **0.2ms/frame** — `entities` (sprite draw stacks) avg **0.10ms**, p95 1.0ms; every other phase ~0. **`other` = 20.7ms of the 20.9ms interval.** Conclusions:
- **The offscreen sprite cache is DEAD as the fix for this jank** — its target is 0.1ms. Do not build it for perf ([docs/offscreen-sprite-cache-plan.md](docs/offscreen-sprite-cache-plan.md) stays shelved; its validation-infra reasoning is still sound if it's ever wanted for other reasons).
- 48fps ≈ the exact 240/5 ProMotion tier and intervals are near-uniform (hitch only 3%) — smells like Safari frame-rate tiering or compositor cost, not JS spikes.

**Round-2 result (same day, Low Power Mode OFF):** `mainlag` 1.47ms avg — main thread idle; **`rafs/frame` 8.1** — the page ran ~8 rAF loops (board + nav torch + every animated SpriteThumbnail card), and each cleared+redrew its canvas EVERY tick despite sprites animating at only 4–12fps → ~8 canvas layers dirtied at 60Hz = compositor load that tiers iOS Safari down. User also pinned a second symptom: tile slides feel jittery even at ~55fps (desktop buttery).

**Fixes shipped 2026-07-15, AWAITING USER RE-TEST:**
- `96aa741` — **dirty-gating**: torch (App.tsx + PlayerApp.tsx twins) + SpriteThumbnail (card phase-queue path AND plain sheet path) only touch their canvas when the frame index changes. rAF loops stay alive; identical repaints skipped; pixel-identical output.
- `c6fd869` — **vsync-aligned board clock**: the animate loop's `now` comes from the rAF timestamp mapped onto the Date.now() epoch (`performance.timeOrigin + timestamp`, 100ms-skew wall-clock fallback) instead of Date.now() at callback execution — removes scheduling jitter from motion sampling. Move-interp sites + lift-off clamp progress ≥ 0 (fresh stamps can sit a few ms in the future). Visual-layer only.

**If jank persists after re-test, next suspects (in order):** (1) `updateProjectiles`/particles still sample Date.now() internally — thread the loop's `now` through if projectile motion judders; (2) the static-bake signature includes `currentTurn`, so EVERY turn rebakes + re-uploads a full-canvas offscreen — could explain turn-boundary hitches (p95 30ms, hitch 15%); sign it on content instead; (3) remaining per-frame-dirty layers (board itself; check `rafs/frame` again — should read ~1-2 with draws mostly gated).

Caveats that still stand: don't re-propose the static-layer bake or gradient caches (they exist) and don't re-raise MAX_DPR (measured regression, see the constant's comment).

---

**MAP EDITOR REDESIGN (user-requested 2026-07-14, audited + Phase 0 shipped same day; Phase 1 COMPLETE later that day).** The user pivoted to this over the feature queue. Phase 0 (first-class Ally/Vessel tools — 7-tool row) shipped in `6045ff1`. **Phase 1 (decomposition) COMPLETE 2026-07-14 third session** — seven pure-move slices `945661f`→`65cd0c1`, MapEditor.tsx 4,600 → 2,234 lines, 545 tests green throughout, `map/` directory now holds: canvasDraw.ts (draw helpers + TILE_SIZE constants), Tooltips.tsx, editorState.ts (EditorState + defaults), ValidationModal.tsx, ToolsRow.tsx, the seven palettes (Tile/Enemy/Ally/Vessel/Object/Collectible/Heroes), ActionsPanel.tsx (incl. publish workflow — its state stays in MapEditor because the panel unmounts during playtest), PuzzleInfoPanel.tsx (state/setState pass-through, so updates stayed byte-identical). Autosave wiring untouched. **NEXT: Phase 2 — the visual direction must be designed WITH the user** (their workflow: real code in small isolated commits, screenshots between slices, ask for reference games when style is unclear — never mockups).

**Audit findings (2026-07-14):** MapEditor.tsx is a 4,454-line monolith + ~10 inline modals. Layout: header (title/grid/undo) → canvas + Selected Heroes strip → TWO right-hand panel columns (col 1 = Tools + active palette; col 2 = tall Actions stack [New/Save/SaveAs/Library/Export/Import/Clear/Validate/Generate/Versions/Publish review workflow] above Puzzle Info [name/skin/sounds/training-arena + win conditions incl. kill-curation + par + side quests]). Pain: everything always on screen; rules touched once per puzzle weigh the same as the palette used constantly; no placed-entity roster; click-toggle-only interaction (no eraser, no inspect, facing-from-asset rule never surfaced in UI); shared search term + label drift ("Item"=collectibles, "Tile" hides void/empty/wall+custom).

**Remaining phases (user has seen and approved this shape):**
1. ~~**Phase 1 — decomposition, ZERO visual change.**~~ **DONE 2026-07-14** (see above). Playtest `<Game/>` mount and autosave wiring untouched as required.
2. ~~**Phase 2 — layout rework.**~~ **SHIPPED 2026-07-14** (user delegated the design: "no reference games, just make it polished/efficient/uncluttered, lose nothing"). Three commits, 545 tests green each: `84842fb` compact toolbar (title + Playtest/Save/Validate/Library + publish status-chip popover w/ full review workflow + ⋯ overflow [New/Save As/Export/Import/Generate/Save Version/History/Clear] + grid size + undo/redo — replaces BOTH old headers and the Actions stack; ActionsPanel.tsx deleted); `c5d5672` single tabbed sidebar Build/Rules/Details (PuzzleInfoPanel split into RulesPanel [hero/turn/life limits + win conditions + par + side quests] + DetailsPanel [name/desc/tags/skin/music/training]; ToolsRow lost its collapse header; per-panel collapse toggles removed — tabs scope visibility now); `c0394ae` "On the Board" placed-entity roster (hover row → copper tile highlight on canvas, ✕ remove = undoable via pushToHistory-first pattern) + status bar under canvas (active tool/asset + cursor tile via new `tileFromMouseEvent`) + "Item" label unification in the collectible palette. **User feedback round 1 (same day — toolbar approved) shipped as `84c3c57` + `933ae59`:** status bar moved INTO the Build tab under the tool grid (it describes the toolbox); roster moved to the left column under Selected Heroes (it describes the board); sidebar max-width cap dropped (Rules/Details keep max-w-xl internally); and ALL seven palettes went from full-width rows to dense sprite-card grids (auto-fill minmax(96px,1fr) — more columns when the canvas is narrow, internal scroll past ~5 rows, details on hover). **AWAITING USER RE-REVIEW.** Dungeon-panel theming pass still LAST, with user references.
3. ~~**Phase 3 — interaction niceties.**~~ **SHIPPED 2026-07-14** — user chose GESTURES over grab/delete tools (AskUserQuestion; the 7 tools stay purely "what am I placing"), all three pieces: `5ed0c97` right-click deletes the placement under the cursor (findPlacementAt: entities > objects > items; undoable); `24ec252` drag-to-move any placement with any tool (mousedown on a placement DEFERS — drag = move w/ ghost preview + copper ring + grabbing cursor, blocked by same-kind occupancy; release-in-place = the pre-existing click; canvas-leave cancels); `7f7a8a9` inspect popover (plain click on entity w/ entity tool active → card at cursor: sprite/kind badge/HP/facing/behavior sequence/Remove). ⚠️ **Deliberate behavior change:** entity tools' click-toggle-remove is GONE (replaced by inspect; removal = right-click / popover / roster ✕) — a stray left-click can no longer delete an enemy. Tile painting under entities unchanged (plain click with tile tools still paints). **Phase 3d (`192f3b1`, user asked about mobile):** canvas migrated mouse→POINTER events + touch-action none — finger drags now paint tiles and move placements; **touch long-press (~650ms, held still) = delete** (user's double-tap idea steered to long-press: a double-tap's first tap already places/toggles/inspects). Android native long-press contextmenu + manual iOS timer share a fired-flag guard (no double-delete on stacked placements; release is a no-op after either fires). **AWAITING USER TEST (desktop + a phone).** **Dungeon theming pass CANCELLED by user** ("I don't care about this page being dungeon styled — only my team sees it") — the map editor redesign is DONE; feature queue unparks.

**THE REDESIGN IS DONE → the feature queue unparks: projectile linger, hero behavior slots, vessel triggers** (homing-reflect timing stays pinned, plan doc §Phase E). **Also pending:** user testing of the whole 2026-07-14 batch on the deployed site — trigger overhaul + hit stamps + instant dispel (damage-smoke pass) AND the full editor redesign (desktop: toolbar/tabs/roster/drag/right-click/inspect; phone: finger drag, long-press delete incl. on a stacked placement, no page-scroll while painting).

**Decided 2026-07-14 (do not relitigate):** BASE-party sensing (charm-blind); same-team events exclude self but SEE stealthed teammates; legacy events map at read time by authoring side (no migration); REPEAT_UNTIL uses SEGMENT semantics (each block loops back only to the previous block); `repeated_times` means "the segment has run N times" and resets on fall-through; counts are a census (stealth doesn't hide); **hit stamps record CONNECTION, not damage-got-through** (user revision same day: invulnerable, deflecting, reflecting, and shield-absorbed targets all stamp, and the attacker gets dealt credit — mitigation gates damage, not the hit; enables "immune until struck" entities); a reflected bolt's RETURN hit credits no attacker; AOE splash / DOT / tile / push damage is 'any'-kind only; **DISPEL/CLEANSE strip instantly on application** (no lingering instance — the turn-start branch is a safety net for initial statuses). Also standing from 2026-07-13: allies collecting items + scoring is intended.

---

**Prior "start here" (2026-04-28 session) kept for context.** Highlights:

- **Playtest unification (5 commits, ~1,500 lines removed net).** MapEditor's playtest mode no longer runs its own embedded game loop — it mounts `<Game/>` directly with the in-progress puzzle. Game.tsx grew three optional escape-hatch props (`puzzle`, `onExitToEditor`, `onTurnExecuted`); MapEditor passes them when mounting playtest, PlayerApp doesn't (so player builds get zero editor-only chrome). Combat log returns as a floating button + modal in the quest panel (next to "Back to Editor"), driven by `onTurnExecuted` → `diffTurn` → modal. Future Game.tsx features automatically benefit playtest, no port tax.
- **Daily-lock placement guard** — `handleTileClick` short-circuits when daily-lock is engaged so locked-out players can't place heroes (parallel to the existing `handlePlay` guard).
- **Auto-target inheritance** — autoTargetRange now seeds from trigger.eventRange when an "in range" trigger event is selected, with sticky dev-override behavior. UI extended to all action contexts (was character-only). Resurrect engine path also picks up the inheritance fallback.
- **CUSTOM_ATTACK + Fire Mage removed** — the legacy attack action type is gone from the enum, switch case, and editor UI; `archer-fireball.json` deleted; ~387 lines pruned across 11 files. `CustomAttack` survives only as the engine's internal projectile/melee data shape.
- **Hero card visual cleanup** — placed-card click semantics (open info), unified copper backdrop between card and info area, removed the dark `bg-black/40` sprite overlay entirely (now just the ✓ checkmark).

See "Recently completed" below for full commit list with rationale and links.

**`HOMING_DEBUG` and `PIERCE_DEBUG` are both `false`** by default. Flip at [simulation.ts:20](src/engine/simulation.ts#L20) (HOMING_DEBUG) or [simulation.ts:34](src/engine/simulation.ts#L34) (PIERCE_DEBUG) if you need traces.

**Backlog status as of 2026-04-30 (evening):**
- Launch-blocking: empty
- Launch-adjacent: **empty.** ~~Object scale/position controls~~ **DONE 2026-04-30** (commits `506918d`, `0e08b68`): added `scale`/`offsetX`/`offsetY` to `CustomObject`, three sliders + Reset in ObjectEditor's Positioning panel, live preview tile mirroring exact renderer math. ~~TypeScript error squash~~ **DONE 2026-05-01**: 267 → 0 across 15 commits.
- Post-launch features: full queue waiting (summon, necromancy, allies, multi-tile melee stitching, breakable container, projectile linger, user-input spell variants, Noble marker, dev badge)
- ~~**Refactor opportunity surfaced by the campaign:** sprite preloader duplication~~ **DONE 2026-04-30**: extracted `collectPuzzleAssetUrls(puzzle)` into [src/utils/spritePreload.ts](src/utils/spritePreload.ts). Game.tsx and MapEditor.tsx now share the URL-collection walk; each call site keeps its own preload function (`preloadImagesEager` for Game.tsx with the ready-flag, `preloadImages` for MapEditor's lazy/idle queue). The unified function also fixes a latent bug where MapEditor's preloader was missing `skin.customTileSprites` — moot at runtime today (the mounted `<Game/>` covers it) but eliminates the drift surface entirely. Tests 237/237, corpus goldens unchanged.

**Older pending tasks (still relevant):**

**`HOMING_DEBUG` and `PIERCE_DEBUG` are both `false`** by default. Flip at [simulation.ts:20](src/engine/simulation.ts#L20) (HOMING_DEBUG) or [simulation.ts:34](src/engine/simulation.ts#L34) (PIERCE_DEBUG) if you need traces.

**Start here — highest priority:**

1. **Remaining playtest coverage** (still paused):
   - **Reflect + homing** (quick smoke test)
   - **Projectile edge cases** — pierce on duplicate-enemyId enemies (touched today, looks good), bolt-through-wall regression, defeat-while-in-flight regression
   - **Regression sweep** — melee, MELEE_CONE, redirect spells, throw/place, status effects (reflect tint, stealth, steadfast)

2. **Known pre-existing divergence sources** (ruled out or minor):
   - **StrictMode dev-mode drift.** React.StrictMode double-invokes `setGameState` updaters in dev. Each run calls `Date.now()`, so timing fields diverge between runs by ~1ms. Only the second run's state is kept. Dev artifact only, disappears in production.
   - **Replay shows bolts reaching tile centers at some turn boundaries.** CORRECT — for turns where the engine's `logicalX/Y` happens to be tile-integer (e.g., spawn turn of straight-homing often moves exactly 1 tile). Not a bug.

3. **Feature work.** [feature-roadmap.md](feature-roadmap.md) or any new feature idea. Replay System + movement determinism + projectile visuals + pierce are substantively done.

4. **Phase D-b (full refactor — NOT RECOMMENDED).** Original plan: move `pendingProjectileDeath` and `pendingVisualDamage` off `PlacedCharacter`/`PlacedEnemy` into a projectile-owned `ProjectileDeferred` record. Investigation 2026-04-30 concluded this is the wrong move — those fields are functioning as a cache/index (`hitResult.deferredDeathEntityId` is the source of truth; the entity-side flag is an O(1) lookup so 17+ call sites can ask "is this entity dying?" without scanning all projectiles). Moving the data forces every site to scan projectiles — performance-negative, no observable win. The verification step the plan wants ("pixel-identical replay regression test") doesn't exist either. **The lite version (consolidate the duplicated `dead || pendingProjectileDeath` predicate via `isEntityFunctional`) was shipped 2026-04-30** in commit `a70e3ab` — 21 call sites collapsed, future "third condition" only touches the helper. Full refactor remains unrecommended.

**Debug tags when `HOMING_DEBUG = true`:**
- `[RDIFF REAL]` / `[RDIFF REPLAY]` — per-event logs for real vs replay diffing.
- `[HOMING-SPAWN]`, `[HOMING-RESOLVE]`, `[HOMING-TARGET]`, `[PROJ-VISUAL-TILE]`, `[PROJ-HIT-CONSUME]`, `[VDMG-CAPTURE]`, `[VDMG-DECREMENT]`, `[DEATH-MUT]`, `[WIN-CHECK]`, `[PATHFIND-HOMING]`, `[APPLY-HIT]` — detailed traces.
- `[REPLAY] Timeline/Events`, `[REPLAY SPAWN]`, `[REPLAY HIT]` — replay reconstruction diagnostics.

**Debug tags when `PIERCE_DEBUG = true`:**
- `[PIERCE-CAPTURE-LINEAR]` / `[PIERCE-CAPTURE-HOMING]` — staging in resolveProjectiles / checkHomingPathForHits.
- `[PIERCE-DISPLACE]` — replay aggregator pushing a shadowed hit to pierceHits.
- `[PIERCE-POPULATE]` — buildReplayProjectiles populating pendingVisualDecrements.
- `[PIERCE-CONSUME]` — per-frame consume loop (FIRING / waiting).

### Open spawn tasks (deferred bugs / features)

_(none currently)_

### One-off tasks (pre-existing)

5. **Replay projectile polish** — minor edge cases (melee VFX timing, etc.). Slow projectile replay is now in good shape after the multi-session projectile work.

6. ~~**Homing + along-path + pierce: REACHED TARGET turn skips along-path hits.**~~ — **Done 2026-07-13** (commit `9854020`). The shared `planHomingTick` reach plan now carries `reachTiles`; both real and headless modes run `checkHomingPathForHits` on the final leg before the target hit lands. Shipped alongside the solver-parity fix (`881f153`) that gave `checkHomingPathForHits` the `HitMode` param — headless was missing along-path hits entirely. 5 pins in `audit-parity.test.ts`.

7. **Homing + along-path + pierce: stale `hitTileIndex` if animation lags past turn boundary.** `pendingVisualDecrements` populated in `checkHomingPathForHits` carry `hitTileIndex` valid for the current turn's tilePath. Homing tilePath is replaced each turn, so any decrement not consumed during this turn's animation window would fire at the wrong tile (or be swept by the batch-consume safety net at landing). In normal play this should not happen — animations are sized to fit `TURN_INTERVAL_MS`. Mitigation if it ever surfaces: force-fire any leftover `pendingVisualDecrements` at the moment `proj.tilePath` is replaced in the homing MOVE TOWARD branch (~5 lines). Standard linear pierce confirmed clean visually 2026-04-24, so this is preventative only.

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
- ~~**PINNED — Pierce + healthbar bug**~~ — **Done 2026-04-24** (commits `364c6be`, `2619e8f`, `b8cd78d`, `d33ea3b`). Per-hit visual decrements via `ProjectileVisualDecrement` accumulated on the projectile; consumed per-frame as the bolt's visual crosses each pierced target's tile. Fixed at three sites: non-homing `walkNonHomingTick`, homing along-path `checkHomingPathForHits`, reflected pierce in `resolveReflectedPath`. Replay parity via `pierceHits` on the lifetime aggregator. Past-turn snapshot fix-up only commits dead when `pendingProjectileDeath` is set (avoids force-killing partial-damage targets in replay). Cross-turn replay decrement loss fixed by including all pierceHits (not per-turn filtered) in non-homing replay reconstruction.
- ~~**Wall bounce: visual direction rotation**~~ — **Done 2026-04-24** (commit `145cce5`). `updateTileBasedVisual` now rotates the projectile sprite per-segment (`tilePath[visualTileIndex] → tilePath[visualTileIndex+1]`) instead of first-to-last averaged. Affects bouncing, reflected non-homing, and homing pathfinding/grid bolts. The two-segment straight-homing reflected branch keeps its own explicit per-segment direction (Euclidean-phase based), more accurate than time-based visualTileIndex.
- ~~**Slow homing projectile visuals**~~ — **Resolved during projectile polish work (April 2026)**. Original symptom (slow bolts not tracking moving targets, disappearing visuals, etc.) was a downstream effect of multiple bugs: stale spawn-anchored interp (fixed by per-turn re-anchor to current visual), broken range gate measuring from re-anchored start (fixed by `pathTraveled` cumulative + measure from stable `startX/Y`), no shrink on fizzle (fixed by despawn shrink + linger). No separate visual code path was ultimately needed.

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

- **Native-resolution rendering Phase 2 (game board), and Phase 3 / Phase 4 with it.** Attempted on 2026-04-17 (commit `f2de97f`), reverted same day (commit `257c50b`). The "shrink the canvas buffer + CSS-upscale" approach is incompatible with the per-sheet `scale` and fractional `sprite.size` knobs the board needs for cross-sheet entity normalization. See [docs/native-resolution-rendering-plan.md](docs/native-resolution-rendering-plan.md) Phase 2 section for full reasoning. Don't reattempt without revisiting that doc. **NOTE (2026-06-30):** board pixel-perfection was *later achieved by a different, much smaller change* — see "Recently completed (June 30, 2026 — integer-zoom board quantization)" below. The "half-pixels are an accepted tax" framing in that plan doc is now superseded for the board.

### Recently completed (July 15, 2026 — mobile render perf: gradient caches, vignette bake, FX toggles)

User felt jank on a simple level even at DPR 2 (after the MAX_DPR 3 experiment was reverted in `19dbc95` — width gain imperceptible, fps cost real; the constant's comment records the measurement). Cheap wins shipped, all pushed, 545 tests + build green:

- **`9d39110` — shadow/glow gradient-sprite caches.** blobShadows/lightGlow rebuilt a `createRadialGradient` per entity per frame. Both gradients' stops are LINEAR in alpha, so one pre-rendered unit sprite (one total for shadows; one per color for glows) drawn with `globalAlpha` × scaling is pixel-equivalent. Smoothing is forced on inside those draws so scaled gradients stay soft on pixelated boards.
- **`13a89f8` — static-vignette bake.** The vignette's static half (4 edge gradients + inner radial + per-tile clip path, five full-area source-atop fills EVERY frame) now bakes to `vignetteBakeRef` (keyed on canvas size/scale/board shape) and composites with ONE source-atop drawImage; fog + dust stay live (already texture-based/cheap). Sequential source-atop fills ≡ compositing the merged overlay (source-over associativity) — pixel-identical.
- **`3a812eb` — Settings ⚡ Effects tab** exposing the three console-only render toggles (`blob_shadows`, `light_glow`, `static_bake`) as live checkboxes, so frame cost can be bisected on a real device mid-level.
- **Discovered en route: the static-layer bake (tiles/border/wall-AO per turn) ALREADY EXISTS** (`staticBake.ts` + `staticBakeRef`) — do not re-propose it.
- **`3977579` — Atmosphere toggle.** The "moving shadow shapes" the user asked about are the fog/mist wisps + dust (drawAtmosphericEffects) — previously the only untoggleable animated pass. New atmosphere.ts (localStorage 'atmosphere'), gated in the loop, 4th checkbox in the Effects tab.
- **BISECTION RESULT (user, same day): no toggle changed smoothness** — the jitter is in the untoggleable baseline. See "Next session — start here" for the profiling brief.

### Recently completed (July 14, 2026, third session — MAP EDITOR REDESIGN complete: decomposition → layout → gestures → mobile)

The whole arc shipped in one session, 545 tests + tsc + eslint + prod build green after every commit, everything pushed. The user approved each phase live ("the new row at the top is nice" → "love it" → "looks great and feels great") and CANCELLED the planned dungeon-theming pass (editor is team-internal). MapEditor.tsx went 4,600 → ~2,300 lines; 18 focused modules now live in `src/components/editor/map/`.

- **Phase 1 — decomposition, zero visual change** (7 pure-move slices, `945661f`→`65cd0c1`): canvasDraw.ts (TILE_SIZE consts + editor-canvas draw helpers), Tooltips.tsx, editorState.ts, ValidationModal.tsx, ToolsRow.tsx, the seven palettes, ActionsPanel.tsx, PuzzleInfoPanel.tsx. Key decisions: ALL state stayed in MapEditor (panels unmount during playtest — component-owned state would reset); PuzzleInfoPanel took state/setState pass-through under the same names so every functional update stayed byte-identical. Autosave wiring + playtest `<Game/>` mount untouched throughout.
- **Phase 2 — layout rework** (`84842fb`, `c5d5672`, `c0394ae`; user delegated the design — "polished/efficient/uncluttered, lose nothing"). Organizing principle: constant-use stays permanent (canvas/tools/palette), once-per-puzzle goes behind tabs (Rules/Details), verbs become a toolbar. Compact toolbar (title + Playtest/Save/Validate/Library + publish status-chip popover with the full review workflow + ⋯ overflow) replaced BOTH old headers and the Actions stack (ActionsPanel.tsx deleted same session it was created — the extraction still paid for itself as staging); single tabbed sidebar Build/Rules/Details (PuzzleInfoPanel split into RulesPanel + DetailsPanel; per-panel collapse toggles removed — tabs scope visibility now); "On the Board" roster + status bar + "Item" label unification.
- **Phase 2 feedback round** (`84c3c57`, `933ae59`): status bar moved INTO the Build tab under the tool grid; roster moved to the left column under Selected Heroes; sidebar width cap dropped (Rules/Details keep max-w-xl internally); all seven palettes went from full-width rows to **dense sprite-card grids** — `grid-cols-[repeat(auto-fill,minmax(96px,1fr))]`, internal scroll past ~5 rows, details on hover/title. The auto-fill grid is what makes the layout flex both ways: narrow puzzle → wide sidebar → more columns, wide puzzle → fewer.
- **Phase 3 — interaction gestures** (`5ed0c97`, `24ec252`, `7f7a8a9`; user chose GESTURES over grab/delete tools via AskUserQuestion — the 7 tools stay purely "what am I placing"): right-click deletes the placement under the cursor (findPlacementAt: entities > objects > items; undoable); drag-to-move any placement with any tool (mousedown on a placement DEFERS — drag = move with ghost preview + copper ring + grabbing cursor, blocked by same-kind occupancy; release-in-place = the pre-existing click, so tile painting under entities is unchanged); inspect popover (plain click on an entity with an entity tool → card at cursor: sprite/kind badge/HP/facing/behavior sequence/Remove). ⚠️ **Deliberate change: entity tools' click-toggle-remove is gone** — removal = right-click / popover / roster ✕; a stray left-click can no longer delete a configured enemy.
- **Phase 3d — mobile** (`192f3b1`, user asked "what about mobile / double-tap to delete?"): canvas migrated mouse→POINTER events + `touch-action: none` — finger drags now paint tiles and move placements (they never worked on touch before, mouse-emulation only covered taps). **Touch long-press (~650ms held still) = delete** with haptic — steered the user's double-tap idea to long-press because a double-tap's first tap already places/toggles/inspects. Android's native long-press contextmenu + a manual iOS timer share a fired-flag guard: whichever fires first claims the interaction (no double-delete on stacked placements, release no-ops after).
- **Theme fonts** (`c6bb15c`, user request): **Jacquard 12** and **Metamorphous** added from Google Fonts the same way as the other 14 (no self-hosted files in this project): CDN `<link>` + splash `F{}` map in BOTH HTML shells, themeAssets.ts fontMap, ThemeAssetsEditor FONT_OPTIONS + preview map. Both verified loading via document.fonts.check in the running app.
- **Still open from the redesign:** hover-only info (action/spell tooltips, roster hover-highlight) has no touch equivalent except the entity inspect popover — build a tap-to-peek fallback only if the team actually edits from phones and feels it.

### Recently completed (July 14, 2026, second session — HIT-STAMP CONDITIONS: the last trigger-overhaul piece)

Four slices, one delivery kind per commit as pre-briefed, plus a same-day semantics revision, 544 tests green throughout (22 pins in `hit-stamps.test.ts`), corpus untouched, build green.

- **Semantics revision (user, same day):** stamps record **CONNECTION**, not damage-got-through — `stampHitLanded` moved BEFORE the invulnerability/deflect gates, and `applyEntityHit` stamps both sides before deflect resolves and inside the reflect branch. An invulnerable/deflecting/reflecting/shielded target is still "hit", and the attacker still "landed" it. This makes "thematically immune until struck by X" entities authorable (trigger on `hit_by_projectile` while invulnerable). Only zero-damage deliveries never stamp.
- **Foundation + melee + windows** ([`703c329`](https://github.com/Jantzulu/puzzle-daily/commit/703c329)) — when a damage-carrying delivery connects, `applyDamageToEntity`/`NoDeflect` stamp the victim's `hitStamps` and the attacker's `dealtStamps` with the turn number under the delivery kind plus `'any'` (`stampHitLanded` in actions.ts). Eight events — `hit_by_melee/projectile/contact/any` + `landed_*_hit` mirrors — read them as pure predicates with the user's three windows (`TriggerConfig.eventWindow` / `CharacterAction.untilWindow`, default `previous_action` = stamp ≥ currentTurn−1; `this_cycle` = stamp ≥ `cycleStartTurn`, refreshed on every REPEAT/REPEAT_UNTIL loop-back; `ever` sticky). Stamps are new-object writes; they ride ALL enemy wrapper copy-backs both directions (action loop, both trigger-phase blocks, REPEAT_UNTIL condition holder), and the actor loops merge feedback-damage stamps off the original via `mergeHitStamps` (per-key latest — same window the externalHealthBefore merges protect). `initializeGameState` strips stamps so `ever` can't leak across runs. Zero-damage combined-lethality calls never stamp.
- **Projectile kind** ([`cf730d6`](https://github.com/Jantzulu/puzzle-daily/commit/cf730d6)) — `applyEntityHit` + `checkHomingPathForHits` (both modes → solver parity pinned) pass `'projectile'`; attacker credited via `findProjectileAttacker` (sourceEnemyIndex first — duplicate same-asset enemies share an enemyId, the append-only index is the instance identity — then characterId, then first-living-by-id). Reflect stamps the struck reflector and credits the caster (connection rule), but the RETURN hit credits no one (`proj.reflected` → `findProjectileAttacker` returns undefined); deflect bounce-back keeps the projectile kind.
- **Contact kind** ([`9f50078`](https://github.com/Jantzulu/puzzle-daily/commit/9f50078)) — both `resolveWalkInCollision` strikes pass `'contact'`: Thorns stamps the walker/credits the defender, Trample the mirror. Wrapper rides pinned in both directions.
- **Editor UI** ([`bef1e92`](https://github.com/Jantzulu/puzzle-daily/commit/bef1e92)) — the 8 conditions in TRIGGER_EVENT_OPTIONS with a `windowParam` marker; both consumers (parallel trigger config + REPEAT_UNTIL until picker) render the three-way window select and stamp an explicit `previous_action` default on selection.
- **"Immune until struck" archetype pinned + DISPEL/CLEANSE made INSTANT (user decisions, same day).** The archetype needs zero bespoke engine code: permanent Invulnerable + a `hit_by_projectile` trigger self-casting (`targetSelfOnly`) a spell whose status rider is a DISPEL targeting invulnerable. To shrink the hit→vulnerability beat to its minimum, DISPEL/CLEANSE now strip **instantly on application** (`applyInstantStatusStrip` in simulation.ts, called by both `applyStatusEffectFromSpell` and `applyStatusEffectFromProjectile`; no instance is ever pushed; the old turn-start processing branch remains as a safety net for initial-status instances). Result: the trigger's self-dispel strips during the trigger phase, BEFORE the same turn's projectile resolution — a mage bolting every turn lands the very next bolt. The strip mutates statusEffects strictly IN PLACE (splice) because the acting entity may be a wrapper sharing the array by reference. Instant timing also matches the StatusEffectEditor's own "Instantly strips…" description, which the old deferral contradicted. **Rejected as its own follow-up (don't re-propose lightly):** a post-projectile second trigger pass to let triggers see same-turn bolt hits — turn-order surgery with double-fire semantics for every existing trigger.
- **⚠️ Deploy spot-check:** none of the new events fire on existing content (new vocabulary), but the stamp writes touch every damage delivery — a quick damage-smoke pass (melee, bolt, thorns walk-in, AOE, DOT) on the deployed site is the ask.

### Recently completed (July 14, 2026 — TRIGGER OVERHAUL: team-relative events + REPEAT_UNTIL + condition vocabulary)

Three slices, design locked with the user turn-by-turn before any code (BASE party / self-exclusion / read-time mapping / segments / freshness windows). 522 tests green throughout, corpus untouched, all pushed.

- **Team-relative trigger events** ([`c919888`](https://github.com/Jantzulu/puzzle-daily/commit/c919888)) — new vocabulary `opposing_*` / `same_team_*` (adjacent / in_range / contact), resolved against the holder's BASE party (charm-blind, like the finders). Legacy `enemy_*`/`character_*` events stay valid on stored assets; `resolveTriggerEvent` (actions.ts, also used by the editor for display) maps them at read time by AUTHORING SIDE, mirroring the auto-target flag convention — **this is what fixed the ally always-true trigger bug** (enemy-shaped `character_adjacent` on an ally now senses opponents). Deliberate changes pinned: same-team events EXCLUDE self (identity via instanceKey so duplicate same-asset entities still sense each other) and SEE stealthed teammates (finder baseline); opposing sensing still stealth-blind. Ridealong fix: `health_below_50` was silently dead for every enemy-shaped holder (char-only lookup). Editor: one relative option list for both contexts; on_death now offered for enemies too (engine support was already pinned by audit sweep 1). 16 pins in `trigger-events.test.ts`.
- **REPEAT_UNTIL** ([`2602197`](https://github.com/Jantzulu/puzzle-daily/commit/2602197)) — sequence action that repeats its SEGMENT (everything after the previous REPEAT_UNTIL, or the list start) until its condition fires, then falls through. Stacked blocks stage behavior: patrol → chase → attack. Condition = `untilEvent`/`untilEventRange`/`untilValue` on the action, evaluated via `checkTriggerCondition` — deliberately NOT the `trigger` field (evaluateTriggers must never fire it as a parallel action). Same-turn semantics mirror REPEAT: looping turns execute the segment-start action, the fall-through turn executes the next action below; empty segments idle and re-check. `planRepeatUntil` (simulation.ts) is the shared control decision consumed by both actor loops; allies ride the enemy loop. 5 pins in `repeat-until.test.ts`.
- **Rich condition vocabulary** ([`4ce8d7e`](https://github.com/Jantzulu/puzzle-daily/commit/4ce8d7e)) — `health_below_pct`, `same_team_health_below_pct` (self excluded), `noble_in_danger` (range around living same-team Nobles; threats stealth-filtered; enemy holders never fire it), `turn_reached`, `opposing_count_at_most` / `same_team_count_at_most` (census — stealth does NOT hide from counts), `standing_on_goal`, and `repeated_times` (REPEAT_UNTIL only: "segment has run N times", counter on the entity in `repeatUntilCounts` keyed by block index, reset on fall-through). Numeric params ride `TriggerConfig.eventValue` / `CharacterAction.untilValue`; `checkTriggerCondition` gained the optional `eventValue` param. Editor option metadata drives per-condition range/value inputs and stamps defaults on selection. 11 pins in `trigger-conditions.test.ts`.
- **⚠️ Deploy spot-check additions:** any authored enemy trigger using `enemy_*` events (same-team sensing) no longer senses ITSELF — content relying on the old always-true quirk plays differently; enemies with `health_below_50` triggers now actually fire them.
- **Next:** ~~hit-stamp conditions~~ — **DONE same day** (see the second-session entry above).

### Recently completed (July 13, 2026 — ALLIES + NOBLE, full feature)

Shipped the same day as the projectile work below: `cbe3b5c`→`0863225` (6 slices) + `c1e9f88` (info panel), 490 tests green throughout. Design locked with the user: separate Ally asset type / authorable noble win conditions / badge-marker board visuals.

- **Engine** — CustomAlly (enemy-shaped, own `custom_allies` namespace) adapts into the enemy pipeline vessel-style; a placement is a `PlacedEnemy` stamped `party: 'hero'`, and the shipped party model needed ZERO ally-specific engine code (pinned in `allies.test.ts`). Noble = `isNoble` asset flag on allies AND hero Characters. Three win conditions: `protect_noble`, `noble_survives_turns`, `noble_reaches_goal` (reuses GOAL tile), with the uniform implied-protect rule — any noble condition makes a Noble death instant defeat (`nobles.test.ts`).
- **Editors** — EnemyEditor parameterized with `assetKind` (KIND config routes storage/labels/folders/usages; Boss↔Noble checkbox swap); Allies tab in the asset manager; Noble checkbox in CharacterEditor; map palette Allies section (placement stamps the party); noble conditions in the win-condition UI with a no-Noble-placed warning.
- **Game page** — quest labels name the Nobles; EnemyDisplay is side-parameterized: enemy tally excludes hero-party units, and a separate Allies box (parchment header, copper selection, new 'allies' help section) lists them, rendering nothing when absent.
- **Slab + cloud** — Allies chapter (heroes accent until a style pass; `iconTabAllies` Panel Forge key); sync under type 'ally', no migration (012 covers it).
- **Board** — boss-skull mechanism generalized to `barIcon` ('boss'|'noble'|'ally'): ally shield / Noble crown next to health bars; placeholder 8x8 pixels + Panel Forge slots `iconNobleHealthBar`/`iconAllyHealthBar` awaiting the user's art.
- ~~**Known limitation:** triggered actions on allies misfire~~ — **FIXED 2026-07-14** by the team-relative trigger events (see the July 14 entry above). **Kept deliberately:** allies collect items + score like hero-party summons (user decision 2026-07-13).

### Recently completed (July 13, 2026 — homing hit-along-path: solver parity + reach-leg scan)

Closes the last substantive projectile item. Two isolated commits, each with failing-first pins in `audit-parity.test.ts`; 475/475 tests, corpus goldens unchanged (no corpus case uses `homingHitAlongPath`).

- **Solver parity** ([`881f153`](https://github.com/Jantzulu/puzzle-daily/commit/881f153)) — `checkHomingPathForHits` ran only in `resolveProjectiles`, so the validator missed every pass-through hit a `homingHitAlongPath` bolt (grid/pathfinding) lands live. It now takes the `HitMode` param mirroring `applyEntityHit`: damage/dedup/replay events shared; 'visual' defers deaths, 'headless' commits them with the same `diedOnTurn = N+1` stamp. Headless advance branch scans the same `plan.turnTiles`.
- **Reach-leg scan** ([`9854020`](https://github.com/Jantzulu/puzzle-daily/commit/9854020)) — pending task #6. `planHomingTick`'s reach plan gained `reachTiles` (rounded pre-move position → target; full BFS path for pathfinding — the same formulas the reach-turn tilePath uses, keeping `pendingVisualDecrements.hitTileIndex` aligned). Both modes scan it before the target hit. **Deliberate live-behavior change:** bolts now bite bystanders on the final leg. ⚠️ Deploy spot-check if any authored spell uses hit-along-path.
- **Pinned as deliberate:** along-path hits ignore stealth (stealth blocks targeting, not a bolt crossing your tile) and skip deflect. Test trick worth reusing: a stealthed bystander sits on the bolt's path without disturbing nearest-visible auto-targeting.
- **THROW_PLACE landing parity** ([`717be08`](https://github.com/Jantzulu/puzzle-daily/commit/717be08), same day) — worse than documented: headless skips the walker position update on hitWall turns, so a wall-stopped throw placed the item at the bolt's PRE-TURN position (the caster's tile for a first-turn wall) in the solver. Both modes now share `resolveThrowPlaceLandingTile` (verbatim extraction of real mode's tilePath-end rule — zero live behavior change). Two pins. Residual corner: bouncing thrown items would still diverge (headless never refreshes tilePath on bounce) — moot unless bounce becomes authorable on THROW_PLACE.
- 📌 **Remaining divergence, PINNED by the user for a future session: homing reflect return-leg timing** (real resolves same-turn, headless over subsequent turns; kill-timing/turn-count can diverge). Details + fix direction in the plan doc's Phase E section and user-memory `in-progress.md`. Do not drop this.

### Recently completed (June 30, 2026 — facing/targeting features + contact-damage reaction)

A four-item session (bug + three facing/targeting features). All engine changes flow through the single `executeTurn`/`executeAction` path, so the headless solver/validator reflects them automatically. **255/255 tests, corpus goldens unchanged throughout.** New shared concept: a **`preCastFacing` revert primitive** (restored in the turn-start reset next to `isCasting`).

- **Wall-placement fix** ([`dd55b0d`](https://github.com/Jantzulu/puzzle-daily/commit/dd55b0d)). `handleTileClick` never checked tile passability, so heroes could be placed on default walls. Added an `isTileBlockingMovement()` guard — reuses the canonical movement validator, so it also closes the latent custom-wall-tile / active-dynamic-blocker variants. Setup-phase only.
- **FACE_DIRECTION → nearest enemy/hero** ([`4624d57`](https://github.com/Jantzulu/puzzle-daily/commit/4624d57), refined [`56f6096`](https://github.com/Jantzulu/puzzle-daily/commit/56f6096)). New `faceTarget` ('nearest_enemy' | 'nearest_hero') on the action + a `faceTargetRange`. Reuses `findNearestEnemies`/`findNearestCharacters` + `calculateDirectionTo` (8-way snap). **Absolute team semantics** (resolved against the actor's own side via `actorIsEnemy XOR wantHero`), so labels are truthful for both hero and enemy behaviors. Editor: Face-mode dropdown + Range in BehaviorSequenceBuilder.
- **Auto-target face-on-cast** ([`56dab04`](https://github.com/Jantzulu/puzzle-daily/commit/56dab04)). `faceTargetOnCast` on auto-target SPELL actions rotates the caster to face its nearest target (direction already computed in the auto-target path). `revertFacingAfterCast` stashes `preCastFacing` and restores it at the next turn start (else the facing persists). Enemies thread `preCastFacing` through all three tempChar copy-back sites. **Answered along the way:** triggered auto-target spells fire at *end of turn* (after sequential actions), not the instant the trigger condition is met.
- **Contact-damage reaction** ([`cb78108`](https://github.com/Jantzulu/puzzle-daily/commit/cb78108)). CONTACT_DAMAGE asset gains `contactDamageAnimate` / `contactDamageFaceAttacker` / `contactDamageKeepFacing`. When a hero walks into a contact-damage enemy, the enemy can play its cast animation and face the attacker. **Timing gotcha:** contact damage fires during the *attacker's* char-loop turn, *before* the holder-enemy's own turn-start reset in the same `executeTurn` — so a naive `isCasting`/`preCastFacing` would be clobbered. Uses a turn-stamped visual marker (`contactReactionTurn` + `contactReactionFacing`) that survives the reset and self-clears; board reads it via the `enemyContactReactionFacing` module map in drawEnemy. "Keep facing" is a plain logical facing change; default "revert" is visual-only (logical facing never changes).
  - **Test-harness bug fixed here:** the `getEnemy` test mock returned `null` for a miss, but the real `getEnemy` returns `undefined`. The engine's `getEnemy(id) !== undefined` check treated `null` as "is an enemy", so heroes were misclassified as moving enemies and the **entire hero-into-enemy combat branch was silently skipped in all tests**. Mock now returns `undefined` (matches production). Any future melee/contact combat test depends on this.

**Deferred (from the same list):** selective per-direction spritesheet loading (#6). Savings are modest (~0.6–2.4 MB/puzzle, browser-cached) and can't be proven safe statically because pushes/redirects can force an entity into a direction it normally never faces — risking a missing-sprite frame and brushing the determinism rule. Maps to the roadmap's open "lazy-load off-screen sprites" item; revisit only if mobile load becomes a real complaint.

### Recently completed (June 30, 2026 — integer-zoom board quantization: pixel-perfect sprites)

User-confirmed fix for the long-standing residual "half pixel" artifact on the board. **Visual-only, logic loop untouched. Build + `tsc --noEmit` clean.** Commit [`670fe32`](https://github.com/Jantzulu/puzzle-daily/commit/670fe32).

**Root cause:** the board quantized the scale so each 48px `TILE_SIZE` landed on integer *physical* pixels (clean tile edges), but a tile is `ART_TILE_PX = 24` art pixels. The per-art-pixel ratio `zoom = physicalTileSize / 24` was almost never a whole number, because `physicalTileSize = round(TILE_SIZE × puzzleScale × dpr)` and `puzzleScale` comes from fitting the puzzle to the responsive max box (`maxWidth = min(container, 900)`, `maxHeight = 525`) — an arbitrary fraction. So sub-tile (art) pixels rendered as a mix of e.g. 4px and 5px columns. DPR is baked into the scale, so the landing spot also varied by device.

**Fix:** quantize the *zoom* to a whole number instead of the tile. Both quantization sites in [AnimatedGameBoard.tsx](src/components/game/AnimatedGameBoard.tsx) (animation loop ~L1193, render ~L1647) now compute `integerZoom = max(1, floor(TILE_SIZE × rawEffectiveScale / ART_TILE_PX))`, `physicalTileSize = integerZoom × ART_TILE_PX`. `physicalTileSize` is now always a multiple of 24 → every art pixel lands on an integer physical-pixel boundary → tiles, skins, and entity sprites all pixel-exact. `floor` (not `round`) guarantees the board **snaps down to fit, never up**, so it never exceeds today's footprint (the old `round()` could even overshoot the box slightly). Cost: board is slightly smaller with more centered margin — typical 4–8 tile puzzles lose ~30–55px width, worst cases (old zoom just above an integer, e.g. 8×6 at zoom 3.67→3) up to ~128px. Verified flooring is *necessary*: bumping up would overflow the 525px height cap on boards like 8×6.

**Not addressed (separate lever):** `MAX_DPR = 2` cap means DPR-3 phones still get an OS-side ×1.5 fractional upscale of the 2× buffer. Intentional perf trade, independent of this fix. Only relevant if softness shows up specifically on high-end phones (not desktop/retina).

**Why this isn't the reverted Phase 2:** Phase 2 shrank the canvas *buffer* and fractionally *downsampled* 48px source art (destroys pixels). This keeps the full-res buffer and constrains the *upscale* factor — sprites are authored small (<20px native) and zoomed *up* by an integer factor, so it's a clean nearest-neighbor enlargement. No conflict with `sprite.size` (the per-sprite/per-sheet scale knobs were already removed 2026-06-11; board art is native-size only).

### Recently completed (June 30, 2026 — sprite/animation polish: editor tooling, death→global, animation-fidelity bug sweep)

A long single session (14 commits, `dd11e24`..`152a2b3`). Three threads: sprite-editor offset tooling, moving Death to a global animation, and a deep sweep of entity-animation fidelity bugs. All visual/editor or visual-layer engine changes — **logic loop untouched, 237/237 tests pass throughout**, and one change actively *improved* determinism (removed a `Date.now()` from `actions.ts`).

**Sprite-editor offset tooling** (all in `SpriteEditor.tsx` unless noted)
- **Whole-pixel offsets** — offset inputs `step="1"` + `Math.round`; shared draw helpers round defensively so legacy/imported fractional offsets can't cause zoom-dependent half-pixel drift.
- **Grid-snap rendering** (`snapAnchorPx`) — odd-dimension sprites now lock to the tile's art-pixel grid instead of sub-pixel centering (even sprites unaffected). Applied to every entity draw path so the board and the offset preview snap identically. Commit `fd9323d`.
- **Faithful offset preview** — `AnchorPreview` honors explicit `frameWidth/frameHeight` (matches the board's slicing for imported sheets); reuses the shared native-size math.
- **Onion-skin overlay** — ghost other directions (or, in Global Settings, a chosen directional pose) behind the slot being edited; per-(direction × animation) selection; art-pixel grid + crosshair; active-opacity fade (preview-only). Controls live under the Off X/Y sliders.
- **Zoom overlay** — magnifier opens a non-blocking, **draggable** floating panel that updates live while you drag sliders.
- **Playable previews** — ▶/⏹ plays the spritesheet, 🔁 toggles loop (default play-once → reset to frame 0); active + ghost layers share one clock so last-frame/first-frame seams can be aligned.
- **Fill-each-icon thumbnails** — `SpriteThumbnail` `fillBox` prop (contain-fit, independent of the removed `sprite.size`) on the Character/Enemy editor list icons (fixes "renders tiny").
- **Card bounds** — `computeCardSpriteAreaHeight` now reserves the tallest *playable* slot (idle/moving/selectIntro/selectLoop), so a selected hero's taller select animation no longer clips. `cardConstants.ts`.
- **Removed the vestigial "Preview (…)" canvas** at the bottom of both tabs (broken render) + its dead `renderPreview` effect and orphaned imports. Commit `152a2b3`.

**Death → single global animation** (`71c4ba0`)
- Death was genuinely directional; now a single non-directional animation authored in the editor's **Global Settings** tab (via the shared `renderNonDirectionalAnim`). `drawDeathSprite`/`hasDeathAnimation` use only the top-level `sprite.deathSpriteSheet`; removed the per-direction death section + the `castingEndTime`-style dead code. Still forced `loop:false` (holds final/corpse frame).

**Animation-fidelity bug sweep** (`AnimatedGameBoard.tsx` + engine where noted)
- **Spawn re-firing every move** — spawn was keyed by `characterId:x,y` (position), so each move looked like a new spawn. Keyed by `characterId` now (stable, matches death keying). Enemies were already index-keyed. `9fd42c9`.
- **Walk for the full moving turn** — an entity that actually changes tiles reads as "walking" for the whole turn (continuous across consecutive moves), idle when a move is blocked. Per-entity `movedThisTurn` flag gated to `gameStatus==='running'`. `9df57fc`.
- **Casting made deterministic + reliable** — `isCasting` is now a **per-turn flag reset once per turn** in `simulation.ts` (alongside `justTeleported`), set on a SPELL action in `actions.ts`; **removed `castingEndTime = Date.now()+800`** (a determinism smell + display-misalignment bug) and the `castingEndTime` field. Board gate is just `!isMoving && isCasting`. Enemy casts now animate (`executeEnemyAction` copies `isCasting` back). A cast turn also overrides a finishing walk from the prior turn (unless it also moves). Commits `9df57fc`, `86dce64`, `6a87304`.
- **Death animation saga** (all visual-layer): corpse now **holds the final frame** instead of reverting to frame 0 (stopped deleting the death anim after a fixed duration; the persistent fixed `startTime` does the right thing) → `6a87304`/`c0bdc9f`; **plays fresh on every puzzle retry** (clear stale anim on dead→alive revive) → `9e20872`; **no frame-0 stall** — the death `startTime` is now stamped in the draw loop the first frame an entity is drawn dead, so it never waits on a variable effect-timing delay → `746766b`/`46f0466`. Confirmed **death/spawn already use the correct board-side display-clock pattern** (only the engine `dead`/`spawned` flags are deterministic; the animation clock lives in the visual layer) — casting was brought up to that standard.

### Recently completed (April 30, 2026 — Phase D-b lite: isEntityFunctional helper)

Investigation of full Phase D-b concluded the move-to-projectile refactor is performance-negative (entity-side flags are caches, not redundancy) and unsupported by missing replay regression infra. Shipped the lite version instead.

- **`isEntityFunctional(entity)`** added to [src/engine/utils.ts](src/engine/utils.ts) — returns `!entity.dead && !entity.pendingProjectileDeath`.
- **21 call sites consolidated** across simulation.ts (15), actions.ts (6), and scoring.ts (1). Pure refactor, semantic-preserving. Tests 237/237, corpus 44 goldens unchanged.
- Sites left inline deliberately: the two `excludePendingDeath`-parameterized `findEntityAt` sites in simulation.ts (~2907/2914), debug log strings, and the Game.tsx replay-snapshot fix-up sites (1629/1639) which check the *opposite* predicate (`!dead && pendingProjectileDeath` — confirming pending IS set).
- Future-third-condition angle is the real upside: if a future spell adds a "petrified" or "banished" state that should be skipped by targeting/movement/win-checks, change one helper instead of 21 sites.

Commit: [`a70e3ab`](https://github.com/Jantzulu/puzzle-daily/commit/a70e3ab).

### Recently completed (April 30, 2026 — object scale/position controls)

Last launch-adjacent backlog item.

- **`CustomObject.scale` / `offsetX` / `offsetY`** added (all optional). `drawPlacedObject` ([AnimatedGameBoard.tsx:3671](src/components/game/AnimatedGameBoard.tsx#L3671)) and `drawObject` ([MapEditor.tsx:4271](src/components/editor/MapEditor.tsx#L4271)) honor them: scale multiplies the `tileSize` passed to `drawSprite`, offsets shift `centerX/Y` after anchor-point math. Defaults preserve prior behavior exactly.
- **ObjectEditor Positioning panel** gets three sliders (Scale 0.25–2×, Offset X/Y ±0.5 tile-fractions) and a Reset button when any value is non-default.
- **Live preview tile** (120×120 with 32px overflow headroom) sits at the top of the Positioning panel. Mirrors the exact transform math from the renderers and re-renders on image loads via `subscribeToImageLoads`. User-validated end-to-end (placed in a puzzle).

Commits: [`506918d`](https://github.com/Jantzulu/puzzle-daily/commit/506918d) (data + render + sliders), [`0e08b68`](https://github.com/Jantzulu/puzzle-daily/commit/0e08b68) (preview tile).

### Recently completed (April 30, 2026 — sprite preloader extraction + handoff cleanup)

Small post-squash refactor closing out the duplication that surfaced during the TypeScript campaign.

- **`collectPuzzleAssetUrls(puzzle)` extracted** to [src/utils/spritePreload.ts](src/utils/spritePreload.ts). Game.tsx and MapEditor.tsx now share the URL-gathering walk (characters/enemies/spell sprites/custom tiles/collectibles/objects/skin sprites). Each call site keeps its own loader: Game.tsx still uses `preloadImagesEager` with the `setSpritesReady(true)` ready-flag; MapEditor.tsx still uses `preloadImages` (lazy/idle). Latent missing case in MapEditor's old preloader (`skin.customTileSprites`) is now picked up by the unified function — moot at runtime today since playtest mounts `<Game/>` and Game.tsx's preloader covers it, but the drift surface is gone.
- **Stale handoff entry removed:** "Wall bounce: `random` behavior" was listed as an open task but the `random` mode was actually removed entirely on 2026-04-27 (commit `46e26a2`) as a determinism decision. `BounceBehavior` is now `reflect | turn_around | turn_left | turn_right` only.

Tests 237/237, corpus 44 goldens unchanged.

### Recently completed (April 30 – May 1, 2026 — TS error squash campaign)

Two-day campaign closing the entire backlog of pre-existing TypeScript errors. **267 → 0 across 15 commits.** Tests stayed at 237/237 throughout, 44 corpus goldens unchanged. Surfaced and fixed **25 real runtime bugs** along the way (tracked in commit messages). Approach was deliberately surgical per the no-bulk-edit rule on the four critical files (simulation, actions, Game, AnimatedGameBoard) — every change reviewed against runtime usage before applying.

**Tier breakdown (all on `main`):**
- A `4ce2d7a` — NodeJS namespace, missing exports, test globals (12 errors)
- B `52c8678` — Compendium type drift + dead UI removal, including the "items always show fallback values" UI bug (23 errors)
- C `6d4f51b` — Narrowing fixes in non-critical files (17 errors)
- D-1 `ceb794a` — 1-error-file sweep (16 errors); fixed faceDirection NaN, missing collisionType, broken cloudSync error message
- D-2 `1aecdc2` — 2-3-error files (18 errors); fixed PixelEditor magic-wand crash, BugReportReplay broken filter
- D-3 `fcf1487` — TileTypeEditor + ThemeAssetsEditor (18 errors)
- D-4 `47935b3` — BugReportModal + corpus snapshot type drift (13 errors)
- D-5 `672626f` — MapEditor 41 → 0; surfaced 5 real preloader-no-op bugs + tab-switch data loss
- D-6 `f34b73c` — DbAsset type widening + PendingDeletion variant (2 errors)
- E-1 `7f20f3c` — Game.tsx 18 → 0; same 5 preloader bugs as MapEditor (duplicated when Game split out) + "Collect all Keys" counter always 0
- E-2 `c810202` — AnimatedGameBoard.tsx 12 → 0; gameStarted false during victory/defeat → wrong sprites
- E-3 `70cac8d` — actions.ts 25 → 0; **applySpellToSelf healing was completely broken** (read non-existent fields, never modified currentHealth); turnLeft/turnRight didn't support 180-degree rotation (silent fallthrough to 90)
- E-4 `1541bfb` — simulation.ts 40 → 0; **closed the long-flagged turnTiles scoping bug** (throw_place projectiles would ReferenceError); trigger-group reset wrote to tileStates as plain object invisible to all Map consumers; preventPlacement guard never fired (read non-existent field)
- E-5 `89fc990` — Last 2 deferred errors; no_damage_taken quest never completed (fixed by adding `maxHealth?: number` to PlacedCharacter and stamping at 8 placement sites); hexagon shape fully wired into all 6 renderers

**Type-system improvements (additive only — backward-compatible):**
- `Tile.customType` (legacy alias for customTileTypeId, used by older saved puzzles)
- `Enemy.folderId` / `Character.folderId` (matched runtime; CustomEnemy/CustomCharacter already had it)
- `PlacedCharacter.maxHealth` (now stamped at placement; fixes no_damage_taken quest)
- `Projectile.homingPathStyle` widened to include `'pathfinding'` (engine had been comparing against this all along)
- `Projectile._turnStartTileIndex` (replaces `as any` casts in Game.tsx replay code)
- `ParticleEffect.rotation` corrected from `number` to `Direction`
- `AssetCategory` includes `'status_effects'`
- `HelpSectionId` includes `'side_quests'`
- `DbAsset.type` widened to all 16 AssetType variants
- `PendingDeletion.type` includes `'collectible'`
- All `shape` unions include `'hexagon'`
- `useFilteredAssets`'s constraint now satisfiable by EnemyWithSprite / CharacterWithSprite
- `getThemeAsset`/`setThemeAsset` typed via generics so each call site infers the right value type from the key

**Real bugs fixed (full list):**
1. Compendium item display always showed fallback values (B)
2. BehaviorSequenceBuilder faceDirection always wrote NaN (D-1)
3. New objects missing required collisionType (D-1)
4. cloudSync error message always read 'undefined' (D-1)
5. PixelEditor shift+click magic-wand merge crashed (D-2)
6. PixelEditor history.undo() called with wrong arity (D-2)
7. BugReportReplay "notable events" filter completely broken (D-2)
8. MapEditor spell sprite preloader was a no-op — 5 wrong field names (D-5)
9. MapEditor object sprite preloader was a no-op (D-5)
10. MapEditor border + tile + goal sprite preloader was a no-op (D-5)
11. Editor state cache silently lost tags/description/sideQuests/par/isTraining on tab switch (D-5)
12-14. Game.tsx had identical preloader-no-op bugs (E-1; the same code had been duplicated when Game.tsx was split out)
15. Game.tsx "Collect all Keys" UI counter always showed 0 (E-1)
16. AnimatedGameBoard gameStarted flag false during victory/defeat → wrong sprites (E-2)
17. actions.ts applySpellToSelf healing completely broken (E-3)
18. Tile direction-change angle:180 silently behaved like 90-degree (E-3)
19-20. Death-trigger entity construction (×2 in actions.ts, ×1 in simulation.ts) used invalid 'right' Direction fallback
21. Day 1 turnTiles scoping bug — throw_place projectiles would ReferenceError (E-4)
22. Trigger-group reset wrote to tileStates as plain object (E-4)
23. preventPlacement guard read non-existent Tile field (E-4)
24. no_damage_taken quest never completed (E-5)
25. Hexagon shape: 5 of 6 renderers fell back to circle (E-5)

**Refactor opportunity surfaced:** sprite preloader code in MapEditor.tsx and Game.tsx was duplicated, and so were all 4 of the preloader bugs in it. Extract `preloadPuzzleAssets(puzzle)` into `src/utils/spritePreload.ts` (or similar) so the two callers share one implementation. Not blocking; do whenever the next preload-related change comes through. Tracked in `docs/feature-backlog.md`.

### Recently completed (April 28, 2026 — playtest unification + cleanups)

Long iterative session, all changes verified by user on Netlify deployment. Major architectural change closing out tech debt around editor/playtest divergence, plus a series of follow-up cleanups.

**Playtest unification — `<Game/>` mounted inside MapEditor (5 commits).**
The editor's playtest had been growing as a parallel mini-game implementation alongside Game.tsx (~5,755-line MapEditor). Each new feature on Game.tsx (replay, bug-report, daily-lock-style modals, defeat-dismiss) had a creeping porting tax on MapEditor to keep playtest at parity. Resolution: stop porting, unify.
- Phase 1 ([95a0351](https://github.com/Jantzulu/puzzle-daily/commit/95a0351)) — Game.tsx grew three optional props: `puzzle?`, `onExitToEditor?`, `onTurnExecuted?`. All purely additive; PlayerApp + dev `/` callers preserve identical behavior.
- Phase 2 ([78ace1d](https://github.com/Jantzulu/puzzle-daily/commit/78ace1d), [9c4e2a6](https://github.com/Jantzulu/puzzle-daily/commit/9c4e2a6)) — MapEditor's playtest branch mounts `<Game puzzle={...} onExitToEditor={handleBackToEditor} />` instead of running its own loop. Started behind a `?gameunify=1` flag, then flipped default-on once verified.
- Phase 3 ([9c037e5](https://github.com/Jantzulu/puzzle-daily/commit/9c037e5)) — stripped the embedded game loop UI (~800-line JSX block) + the simulation `setInterval` useEffect (~125 lines). Net `-935`/`+14`.
- Phase 4 ([a2ed7f7](https://github.com/Jantzulu/puzzle-daily/commit/a2ed7f7)) — pruned orphaned state (gameState/setGameState, isSimulating, livesRemaining, puzzleScore, defeatDismissed, trackedRuns, runTrackedRef, testMode, themeAssets/subscribe, etc.), orphaned handlers (handleTileClick/Play/Pause/Reset/Wipe/ShowSolution/Restart/Concede/AutoReset/Step/TestEnemies/TestCharacters/ProjectileKill, renderLivesHearts), and orphan imports. Net `-551`/`+27`.
- Phase 5 ([a036380](https://github.com/Jantzulu/puzzle-daily/commit/a036380), [2e2b8a5](https://github.com/Jantzulu/puzzle-daily/commit/2e2b8a5)) — combat log re-introduced as a "📜 Log" floating button in Game's quest panel (next to Back to Editor) opening a modal in MapEditor. Wired via `onTurnExecuted` → `diffTurn(prev, next)` → `combatLog` state → modal render. Editor-only — PlayerApp doesn't pass the callback so it never activates.

**Defensive guards on the daily lock ([abc20eb](https://github.com/Jantzulu/puzzle-daily/commit/abc20eb)).** Locked-out players could still place/remove heroes on the board because `handleTileClick` wasn't gated on `dailyLockStatus`. Same `if (dailyLockStatus) return;` short-circuit pattern as the existing handlePlay guard. Hero cards remain clickable for re-reading info (per the placed-card flow shipped earlier).

**Auto-target inheritance ([1f2f947](https://github.com/Jantzulu/puzzle-daily/commit/1f2f947)).** Final design after a clarifying back-and-forth: autoTargetRange UI control extended to all action contexts (was character-only); auto-seeds from trigger.eventRange when an "in range" trigger event is selected; sticky dev override (explicit autoTargetRange wins over future trigger.eventRange changes once dev has set it). Resurrect engine path also picks up the `autoTargetRange || trigger?.eventRange || 0` fallback at line 3554.

**CUSTOM_ATTACK + Fire Mage removal ([d56d63c](https://github.com/Jantzulu/puzzle-daily/commit/d56d63c)).** The last remaining legacy attack-system entry point. `archer-fireball.json` (Fire Mage) deleted, `ActionType.CUSTOM_ATTACK` enum entry gone, `customAttack/customAttackId` fields removed from `CharacterAction`, `executeCustomAttack` function gone, `AttackEditor.tsx` deleted (174 lines), MapEditor + Tooltips + CharacterEditor + helpers test fixtures cleaned up. Storage helpers (`saveCustomAttack/getCustomAttacks/deleteCustomAttack/loadCustomAttack`) removed (~50 lines from assetStorage.ts). Net `-387`/`+15` across 11 files. `CustomAttack` type itself stays — engine still uses it as the internal data structure for projectile/melee runtime parameters.

**Hero card visual cleanup ([0d69788](https://github.com/Jantzulu/puzzle-daily/commit/0d69788), [4ab4415](https://github.com/Jantzulu/puzzle-daily/commit/4ab4415), [f3d8faa](https://github.com/Jantzulu/puzzle-daily/commit/f3d8faa)).** Iterative tightening based on user playtest feedback:
- Placed hero cards now clickable for re-reading info (previously fully blocked).
- Selected placed-card backdrop unified with info area (`bg-copper-900/15` on both, mirroring the enemy display's `bg-blood-900/15` pattern).
- The `bg-black/40` sprite-overlay dim removed entirely for placed cards — the dark rectangle behind sprites was visually distracting and the outer card's `opacity-50` (when not selected) carries the "this hero is placed" signal sufficiently. The ✓ checkmark stays as the explicit "placed" indicator.

**Documentation + memory hygiene** — feature-backlog.md updated; CLAUDE_HANDOFF.md got a doc-map section ([37e6baa](https://github.com/Jantzulu/puzzle-daily/commit/37e6baa)) describing where each artifact lives; stale memory files (pierce-healthbar bug, wall-bounce history) refreshed to reflect current state.

**Captured tech-debt note for future session.** `tsc --noEmit` reports **267 errors across 41 files** — pre-existing tech debt around missing exports, type drift (e.g. `subSteps`, `preventsAllActions`, `processAtTurnStart` on `StatusEffectAsset`), comparisons to legacy enum values, etc. Filtered as "not from my changes" throughout this session, but worth a dedicated error-squash session. Logged in `docs/feature-backlog.md` under launch-adjacent.

### Recently completed (April 24, 2026 — pierce healthbar end-to-end + per-segment sprite rotation)

User-driven session, every change verified live and pushed in sequence. Closed the long-pinned pierce + healthbar bug across both live and replay, then a sprite rotation polish pass on top.

**Pierce + healthbar — live (commit `364c6be`).**
Added `ProjectileVisualDecrement` type (entity + damage + `hitTileIndex`) and `pendingVisualDecrements?: []` field on Projectile. Each pierce pass-through stages an entry at three sites: non-homing `walkNonHomingTick` (in resolveProjectiles step processing), homing along-path `checkHomingPathForHits`, and reflected pierce in `resolveReflectedPath`. Extracted `commitDeferredVisualDamage` helper (decrement + death-commit) — used by both the existing `hitResult.deferredDeath*` path and the new pendingVisualDecrements iteration. Per-frame consume in `updateProjectiles` fires each entry when the bolt's visual sprite crosses its tile (matching how single-hit spells apply damage on visual contact). Stale corpus goldens for cases 17 + 20 regenerated to match the BFS fix (independent issue, surfaced during this work). 235 tests + 2 regenerated goldens = 237 passing.

**Pierce + healthbar — replay parity (commit `2619e8f`).**
`checkHomingPathForHits` now emits `hit` events for every along-path pierce (was silent). Lifetime aggregator gained `pierceHits: ProjectileEvent[]` — when a new end-event displaces a previous `hit`, the displaced one was a pass-through; push to pierceHits. `buildReplayProjectiles` populates pendingVisualDecrements from this turn's pierceHits, which feeds the same per-frame consume. `copySnapshotForPlayback` past-death-commit logic extracted to a helper, applied to both `life.end` and each entry in `life.pierceHits`.

**Replay over-kill regression fix (commit `b8cd78d`).**
`applyPastDeathCommit` was force-killing any past-turn target with a `deferredDeathEntityId` event — but that field is set on every damaging hit, not just kills. A 1-damage pierce on a 50-HP enemy would commit dead in subsequent-turn replay snapshots. Same latent bug existed for single-hit non-killing bolts. Fix: also require `pendingProjectileDeath` in the snapshot. Genuine deferred kills satisfy this; partial-damage hits don't.

**Cross-turn replay decrement loss (commit `d33ea3b`).**
Diagnosed via temporary `PIERCE_DEBUG` traces. Live projectile persists across turns — `pendingVisualDecrements` accumulates and decrements fire as `currentTileIdx` reaches each, even slightly after the next executeTurn. Replay projectile is REBUILT each turn — when filtered by `e.turn === turnIndex`, prior turns' unconsumed decrements were lost on rebuild. Bars appeared to "drop" only because the next snapshot already had live-decremented values (delayed-feel mismatch). Fix: for non-homing (stable spawn-time tilePath), include ALL pierceHits in every replay turn's pendingVisualDecrements. Per-frame consume safely no-ops on entities whose `pendingVisualDamage` is already 0 (`Math.max(0, 0 - dmg)`). For homing (per-turn tilePath), keep the per-turn filter — stale indices would mis-fire. PIERCE_DEBUG flipped back to false after diagnosis.

**Per-segment sprite rotation (commit `145cce5`).**
`updateTileBasedVisual` was rotating the projectile sprite from `tilePath[0]` to `tilePath[length-1]` — averaged angle for any path with direction changes. Bouncing (Z-shaped), reflected non-homing, and homing pathfinding/grid bolts all visibly tilted relative to their actual heading. Now per-segment: `tilePath[visualTileIndex] → tilePath[visualTileIndex+1]`, with fallback to last segment at the final tile. Skip the override for the two-segment straight-homing reflected branch — that branch already sets direction explicitly per Euclidean phase, more accurate than time-based visualTileIndex (which can drift on diagonal segments).

**Files touched this session:**
- `src/types/game.ts` — `ProjectileVisualDecrement` type + `pendingVisualDecrements?` field on Projectile.
- `src/engine/simulation.ts` — `commitDeferredVisualDamage` helper, accumulation at 3 pierce sites, per-frame consume in `updateProjectiles`, `checkHomingPathForHits` event emission, per-segment sprite rotation (with two-segment-reflect skip), `PIERCE_DEBUG` flag + traces.
- `src/components/game/Game.tsx` — lifetime struct gains `pierceHits`, aggregator captures displaced hits, `buildReplayProjectiles` populates pendingVisualDecrements (all-pierceHits for non-homing, per-turn for homing), `copySnapshotForPlayback` extracted helper + walks pierceHits, `pendingProjectileDeath` guard on past-death commit.
- `src/engine/__tests__/corpus/cases/17-homing-pathfinding-moving-target.real.golden.json` + `20-reflect-vs-homing-pathfinding.real.golden.json` — regenerated to match the BFS fix from prior session.

### Recently completed (April 23, 2026 — second session: homing replay parity, BFS fix, movement determinism, projectile despawn shrink, log cleanup)

Long iterative session, all changes verified live by user. Covers: grid/pathfinding homing replay parity (confirmed clean by user), BFS direction-bias fix, deferred-death commit fixes for replay, movement-blocker determinism race, projectile fizzle shrink animation in both live and replay. Ended with `HOMING_DEBUG` flipped back to `false` and all chatty replay logs gated on the same flag.

**Grid / pathfinding homing replay — tilePath reconstruction fix.**
Grid replay was producing a different `tilePath` than the real engine for per-turn segments because `buildReplayProjectiles` was passing *fractional* `prev` coords to `getTilesAlongLine`, which uses `safeFloor(start)` / `round(end)`. For fractional start coords with `.5+` components, that produced an extra leading tile (e.g. real `(5,6)→(5,7)` became replay `(4,5)→(5,6)→(5,7)` → 3 tiles, `tileTransit = 0.4s`) or collapsed to a single-tile path via the `noMove` guard when both floor/round landed on the same tile (→ bolt frozen for the turn). Real engine avoids this by rebuilding from `Math.round(logical)` each turn. Fix: round the `prev` start coords before calling `getTilesAlongLine` / `findPathBFS` in the per-turn segment construction. ([Game.tsx](puzzle-game/src/components/game/Game.tsx) grid/pathfinding branch of `buildReplayProjectiles`.)

**Final-turn enemy death not committing in replay.**
The final kill's enemy stayed pendingDeath forever in replay because the `hit` event schema didn't carry `deferredDeath*`, so `buildReplayProjectiles` built a `hitResult` that deactivated the bolt but never decremented `pendingVisualDamage` / committed `dead=true`. Fix: (1) added `deferredDeathEntityId`, `deferredDeathIsEnemy`, `deferredDeathIndex` to `ProjectileEvent`; (2) populated them at the three relevant `hit` emission sites in `simulation.ts` (homing REACHED TARGET at ~3889, non-homing hostile_hit at ~4104, reflected via `walkReflectedPath` at ~3346); (3) forwarded onto replay's `hitResult` in `buildReplayProjectiles`.

**Dead → alive → dead death-animation stutter in replay.**
Snapshots are captured at end of each turn's `executeTurn`, BEFORE deferred-death visual commits fire in that turn's animation window. So a snapshot for turn N has entities killed on turn M<N still showing as `pendingDeath`. Advancing replay to turn N revived them briefly (snapshot-loaded pendingDeath → alive sprite) until the bolt's visual commit re-fired and killed them again. Fix in `copySnapshotForPlayback`: walk `projectileLifetimesRef` and for every `hit` event with `deferredDeath*` on a turn strictly before `index`, force `dead=true, pendingProjectileDeath=false, pendingVisualDamage=0, currentHealth=0` on the loaded copy. Current-turn hits are left alone so the turn's visual commit still runs and fires the death animation at the right moment.

**BFS tie-break: `findPathBFS` now sorts neighbors by squared distance to target.**
Previously the fixed `dirs` order (N/NE/E/SE/S/SW/W/NW) meant SW neighbors dequeued before W and NW. For NW-trending targets, BFS discovered `(1,1)` via `(2,2)` before via `(2,1)`, so bolts took visibly-wrong southern detours. Since all shortest paths on a uniform-cost grid are equivalent length, reordering by target-distance before enqueueing changes *which* shortest path gets returned (trending straight at the target) without changing length. Still deterministic (stable sort + dist tie-break falls back to dirs order). ([simulation.ts](puzzle-game/src/engine/simulation.ts) `findPathBFS`.)

**Movement-blocker determinism race — `diedOnTurn` stamp + `isFreshlyDead` gate.**
User caught a determinism violation: the second enemy to die sometimes progressed an extra tile before dying, nondeterministically. Root cause: the deferred `pendingDeath → dead` commit fires in the animation loop, and depending on whether it lands before or after the next `executeTurn` boundary, the commit-blocked vs. corpse-passable state of the tile differs. Enemy AI movement sees a different blocker configuration and picks different tiles.

Fix: stamp `diedOnTurn = gameState.currentTurn` at every site that sets `entity.dead = true` (once, using `if (diedOnTurn === undefined)` so it survives the pending→dead→pending flip path). Added `isFreshlyDead(entity, currentTurn)` helper — returns true when `dead && currentTurn <= diedOnTurn`. `diedOnTurn` semantics = "turn the visual death plays":
- Immediate deaths stamp `currentTurn` (visual plays same turn).
- Deferred (projectile-pending) deaths override to `currentTurn + 1` at the pending-set sites (visual plays next turn when the bolt arrives).

Uniform rule: tile blocks through `diedOnTurn`, walkable the turn after. Matches user's mental model ("tile state during death turn persists, changes at start of next turn"). Movement blocker in `actions.ts` checks `isFreshlyDead` in the `deadEnemy` branch (returns `updatedChar` before corpse wall/halt/walkable rules) and in a symmetric freshly-dead character guard.

**Projectile despawn shrink animation (wall, OOR, target-lost).**
Projectiles that fizzle without landing on a target now shrink-to-nothing instead of vanishing instantly. Three paths feed into the same scale math:
- **Wall hit mid-flight**: engine signals `hitResult.deactivate` with no vfx/death/item → `drawProjectile` front-loads shrink during the final `DESPAWN_SHRINK_MS` (250ms) of travel using `consumeAtMs = anchor + hitTileIndex * tileTransitMs`.
- **Homing OUT OF RANGE** (next-turn fizzle decided at turn boundary with no travel window that turn): predictive shrink fires on the *prior* turn's last 250ms when `remaining < 0.5` (or `< 1` for pathfinding), same threshold the engine uses.
- **Non-homing range/bounds fizzle**: same predictive, fires unconditionally when approaching the tilePath endpoint (tilePath is the spawn-clamped flight, so reaching the endpoint always precedes a fizzle).
- **Homing target-lost mid-flight** (another bolt kills the target): can't predict — targetDeath is an external event. These use `despawning=true` linger for a shorter `TARGET_LOST_LINGER_MS` (125ms) post-consume to show a visible shrink without excessive wall-clock extension. `maybeMarkLingerDespawn` helper internally detects "predictive already covered" cases and skips the linger to avoid a scale-1 pop.

New fields on `Projectile`: `despawning`, `despawnStartTime`. New constants: `DESPAWN_SHRINK_MS`, `TARGET_LOST_LINGER_MS`. Helper: `maybeMarkLingerDespawn(proj, hitTileIndex, now)` called at every clean-deactivate `hitResult` site (4 sites in `simulation.ts`, 1 in `buildReplayProjectiles` for replay parity). Also fixed `drawDefaultProjectile` to accept + use `scale` (previously hardcoded 8/4 radii — shrink was invisible for bolts without custom sprites).

**Replay predictive shrink — `pathTraveled` reconstruction.**
Replay bolts had `pathTraveled` undefined, so the homing OOR predictive never fired. Fixed `buildReplayProjectiles` to reconstruct cumulative `pathTraveled` by summing Euclidean distances across `life.homingMoves` segments. Count = `turnIndex - life.spawnTurn + 1` (engine updates `pathTraveled` during turn K's `resolveProjectiles` before animation, so animation-time value includes turn K's move).

**Log cleanup.** Flipped `HOMING_DEBUG = false`. Also gated the following previously-unconditional logs on `isHomingDebug()`: `[RDIFF REPLAY]`, `[REPLAY] Timeline`, `[REPLAY] Events`, `[REPLAY SPAWN]`, `[REPLAY HIT]`. Kept `[REPLAY] Using live capture` as an unguarded informational log.

**Files touched this session:**
- `src/types/game.ts` — `ProjectileEvent.deferredDeath*`, `PlacedEnemy.diedOnTurn` + `PlacedCharacter.diedOnTurn`, `Projectile.despawning` + `despawnStartTime`.
- `src/engine/simulation.ts` — `findPathBFS` neighbor sort, `diedOnTurn` stamping at 2 `entity.dead = true` sites (`applyDamageToEntity`, `applyDamageToEntityNoDeflect`, plus `applyEntityDeath`) and 3 pending-set sites (override to +1), `DESPAWN_SHRINK_MS`, `TARGET_LOST_LINGER_MS`, `maybeMarkLingerDespawn` helper + calls at 4 clean-deactivate sites, top-of-loop despawning handling in `updateProjectiles`, `HOMING_DEBUG = false`.
- `src/engine/actions.ts` — `isFreshlyDead` helper, fresh-dead guards in the shared movement blocker (enemy + character paths).
- `src/components/game/Game.tsx` — replay `deferredDeath*` forwarding in `buildReplayProjectiles`, past-death commit application in `copySnapshotForPlayback`, `pathTraveled` reconstruction, `maybeMarkLingerDespawn` call on replay clean-deactivate, `isHomingDebug()` gating on replay logs.
- `src/components/game/AnimatedGameBoard.tsx` — shrink block in `drawProjectile` (3 branches: despawning linger → approach-shrink from hitResult → predictive), `drawDefaultProjectile(scale)` parameter.

### Recently completed (April 23, 2026 — replay event-capture rewrite: replay now lives off real-play events)

Big architectural change. Straight-line homing replay now matches the live game; user confirmed "linear homing looks perfect." Grid and pathfinding homing styles still need playtest coverage (see "Next session — start here"). All 237 tests pass; corpus goldens unchanged.

**Problem solved.** `buildReplayProjectiles` used to consume events from a **parallel headless re-simulation** (`updateProjectilesHeadless`). Any tiny logical difference between `resolveProjectiles` (real) and `updateProjectilesHeadless` (headless) compounded across turns — especially with moving targets and duplicate-enemyId scenarios — and by ~4 bolts in replay didn't match the real run. The clean fix: emit events directly from the real-play engine and consume those.

**What changed:**

1. **`projectileTimeline` now seeded on the live `gameState`** ([Game.tsx:~746](puzzle-game/src/components/game/Game.tsx)). `handlePlay` sets `gameState.projectileTimeline = []` at the placement→running transition. `executeTurn`'s deep-copy keeps the array alive across turns, so events accumulate naturally. Previously only the headless re-sim seeded it — that's why `[RDIFF REAL]` logs were empty.

2. **Live turn-history capture in the setInterval updater** ([Game.tsx:~380](puzzle-game/src/components/game/Game.tsx)). Every real `executeTurn` now snapshots the post-turn state into `turnHistoryRef.current` via a closure var (StrictMode-safe — only the kept run's state is captured). `projectileTimelineRef.current` is mirrored from the post state.

3. **`handleWatchReplay` prefers live refs** ([Game.tsx:~1001](puzzle-game/src/components/game/Game.tsx)). When `turnHistoryRef.current.length > 0`, use it directly and skip `generateTurnHistory()`. The headless re-sim is kept as a fallback for the (unlikely) case where live capture is empty (e.g., code paths we didn't hook). `generateTurnHistory` also kept intact for the solver.

4. **`recordProjectileEvent` guard now fires during real play.** The early-return `if (!gameState.projectileTimeline) return;` in `simulation.ts` was never dropped — once the live state is seeded, events record naturally. No `simulation.ts` change to the guard itself.

5. **Added event emissions at every real-play site.** `resolveProjectiles` and friends previously emitted only `homing_move`; `updateProjectilesHeadless` was the only place that emitted `spawn` / `hit` / `wall_hit` / `reflect` / `deactivate`. Added all of those to:
   - Top of `resolveProjectiles` per-projectile loop: `spawn` (gated by `proj._recorded`).
   - Homing OUT OF RANGE: `deactivate`.
   - Homing wall-block: `wall_hit`.
   - Homing REACHED TARGET: `hit` (on top of the existing `homing_move`).
   - Homing reflect: `reflect` (after `combinedPath` and `reflectAtTileIndex` finalized) + inner `hit` / `deactivate` for the reflected leg.
   - Non-homing `walkNonHomingTick` step processing: `hit` for every pierce target (not just pierce-stop), `wall_hit` on wall steps.
   - Non-homing reflect: `reflect` + `hit`/`wall_hit` emissions inside `resolveReflectedPath`.
   - Fallback `deactivate` at range-exhausted / throw_place landing, deduped against any end event already emitted this turn.

6. **New `targetX / targetY` fields on `ProjectileEvent`** ([types/game.ts:~1043](puzzle-game/src/types/game.ts)). Populated on `homing_move` / `hit` / `deactivate`. Lets replay interp toward the same fractional aim point the live engine used — for straight-homing bolts, this matches the per-turn speed feel exactly (turn 1 of a bolt aiming at an enemy 2 tiles away uses target=(5,5) totalDist=2.0 totalTime=1.6s, like real, not target=(4,5) totalDist=1.0 totalTime=0.8s which made bolts look jumpy).

7. **`buildReplayProjectiles` straight-line homing uses Euclidean interp.** For `homingPathStyle === 'straight'`, set `homingVisualStartX/Y = prevPos` and `targetX/Y = engineTargetX/Y` on the replay projectile. `updateStraightLineHomingVisual` in `updateProjectiles` then drives the bolt smoothly in fractional space — same code path as the live game. `tilePath` still built for hit-consume timing via `currentTileIndex >= hitTileIndex`.

8. **`logicalX/Y` for straight-homing replay projectiles is now fractional.** `const logicalX = isStraightHoming ? thisPos.x : posAtTurn.x` (and Y). Previously the fractional value was then clobbered by a follow-up block `proj.logicalX = proj.tilePath[tileIdx].x` that pinned it to the tile. **Removed that clobber block** (the fix above already produces the correct position for every style). Without this removal, step-back snapped bolts to tile centers even though `logicalX` was technically fractional when first written.

9. **`ProjectileVisualState.lastUpdateTurn` for freshness tracking** ([types/game.ts:~840](puzzle-game/src/types/game.ts)). Stamped by `updateProjectiles` each frame. `drawProjectile` uses it to distinguish "paused mid-flight, vs is fresh" from "stepped, vs is stale." During pause (turn unchanged), vs is preferred → bolt stays at true fractional mid-flight position instead of snapping to logical. During step/seek (turn changed), vs is stale → fall back to logical.

10. **Explicit vs invalidation on turn-change-while-frozen** ([AnimatedGameBoard.tsx:~1176](puzzle-game/src/components/game/AnimatedGameBoard.tsx)). Animate-loop-scoped: when `replayFrozen && prevRenderedTurnRef.current !== gameState.currentTurn`, walk the vs map and delete entries whose `lastUpdateTurn` doesn't match. Defense-in-depth against races in the `lastUpdateTurn` bookkeeping.

**Known pattern for future event-emission additions.** If you add a new branch to `resolveProjectiles` that sets `proj.hitResult = { ...deactivate: true }` without going through `walkNonHomingTick`, also add `recordProjectileEvent(gameState, { type: 'deactivate'|'hit'|'wall_hit', ... })` at the same site. The fallback block at the end of `resolveProjectiles` only catches range-exhausted cases — anything else needs an explicit emission or replay won't see the end event and the bolt will render forever.

**Files touched:**
- `src/types/game.ts` — `ProjectileEvent` (targetX/Y), `ProjectileVisualState` (lastUpdateTurn)
- `src/engine/simulation.ts` — event emissions in `resolveProjectiles` and `resolveReflectedPath`; `vs.lastUpdateTurn` stamped in `updateProjectiles`
- `src/components/game/Game.tsx` — `handlePlay` seed, setInterval turn-history capture, `handleWatchReplay` uses live refs, `buildReplayProjectiles` straight-homing fractional-logical + Euclidean interp, removed tile-clobber
- `src/components/game/AnimatedGameBoard.tsx` — `prevRenderedTurnRef`, vs invalidation in animate loop, `drawProjectile` freshness check

### Recently completed (April 22, 2026 — pathfinding homing playtest + pendingVisualDamage + replay rebuild)

Committed at `f2e71bb` mid-session. Live gameplay is in a good place per user. Replay rebuild landed but still diverges after ~4th bolt in complex scenes — see "Next session — start here" for the option-2 proper fix.

**`pendingVisualDamage` refactor (the big one).**
Replaced `visualHealth` (single scalar per entity) with `pendingVisualDamage` (counter per entity). `visualHealth` broke with multi-bolt overlap — the second bolt's write overwrote the first's, so damage visually "vanished" or "doubled" depending on order. Each hit now increments `pendingVisualDamage` by that hit's damage; each visual arrival decrements by the same. Healthbar draw site reads `currentHealth + pendingVisualDamage`. Affects `game.ts` type def, `applyEntityHit` (returns `damageApplied`), `checkHomingPathForHits`, `AnimatedGameBoard.drawHealthBar` calls, hit-consume sites. `ProjectileHitResult.damage` added to carry the decrement across deferral. **Known pre-existing gap:** pierced-through enemies don't get decremented — see pinned task #2 above.

**`pathTraveled` for homing range accuracy.**
`totalDistanceTraveled` was re-anchored each turn (for visual interp support), breaking the range gate measurement. Added cumulative `pathTraveled` field on Projectile, accumulated at every MOVE TOWARD / REACHED TARGET branch. Range gate now uses this. Ported to both `resolveProjectiles` (real) and `updateProjectilesHeadless` (headless) for determinism. Reset to 0 on reflect.

**Pathfinding homing fixes.**
- **MOVE TOWARD off-by-one.** Pathfinding bolt reached its target tile but the hit registered a turn late. Added `pathfindingReachesThisTurn` check — if the pathfinder's last tile this turn is the target tile, resolve the hit immediately instead of flipping to REACHED TARGET next turn. Applied to real + headless. Corpus case 17 regenerated (kills turn 2 instead of turn 3).
- **Fractional-tile stall.** When `remainingRange` was in `(0, 0.5)`, `floor(remainingRange) = 0` produced a 1-tile path and the bolt froze forever. Added `pathfindingCantAdvance` condition to treat as out-of-range.
- **OUT OF RANGE stutter.** Fizzling pathfinding bolts snapped backward/forward at the end of their life. Fix: when range gate fires, compute the current visual position via `currentStraightLineHomingVisualPos` helper, set a single-tile `tilePath` at that position, and fire `hitResult` immediately so consume happens this frame. No teleport, clean fizzle.

**Trigger / autoTarget fixes.**
- **`autoTargetRange` inheritance.** When a spell's range equals its trigger's eventRange and `autoTargetRange` isn't set, the spell was firing without a target (downgrade). Now `autoTargetRangeFallback = action.autoTargetRange || action.trigger?.eventRange || 0`.
- **Triggers pick pendingProjectileDeath entities.** A trigger firing the same turn as a killing shot could pick the dying entity; `resolveProjectiles` later excludes pendingDeath and falls back to a different instance, causing mid-flight redirect. Added the pendingDeath filter to `enemy_adjacent`, `enemy_in_range`, `contact_with_enemy`, `character_adjacent`, `character_in_range`, `contact_with_character` triggers.

**Straight-line homing visual sync.**
- **Downgraded straight bolt VFX mismatch.** VFX was firing before the sprite arrived. `updateTileBasedVisual` STRAIGHT-LINE branch now derives `visualTileIndex` from Euclidean interp progress (matches the sprite's actual position instead of using logicalTileIndex which jumps on turn boundaries).

**Replay reconstruction rewrite (still has known divergence).**
- Added `homing_move` event type — emitted on each homing MOVE TOWARD / REACHED TARGET with the logical position at turn end. Captured in `projectileLifetimesRef` as `homingMoves: ProjectileEvent[]`.
- Rewrote `buildReplayProjectiles` with a homing vs non-homing split:
  - **Non-homing:** stitched path from spawn → hit/wall/deactivate event tiles.
  - **Homing per-turn segments:** for each turn, build a segment from prev position to this position. Style determines path construction: `pathfinding` → `findPathBFS`, `grid`/`straight` → `getTilesAlongLine`. Exported those two helpers from simulation.ts.
  - **`noMove` guard:** when `|prev - this| < 0.01`, use a single-tile path at `round(thisPos)`. Prevents a bug where `getTilesAlongLine(x, y, x, y)` returned a 2-tile path due to `floor` (start) vs `round` (end) asymmetry for coords like (5.89, 6.97).
- `recordProjectileEvent` now logs `[RDIFF REAL]` / `[RDIFF REPLAY]` per event for real-vs-replay diffing. **Note:** `[RDIFF REAL]` is currently empty during real play because `recordProjectileEvent` early-returns when `gameState.projectileTimeline` is undefined — and that's only set on the headless state. This is the core issue next session needs to address (see start-here #1).
- **Residual divergence:** after ~4th bolt in complex multi-target scenes, replay projectile counts and speeds differ from the real run. Root cause: replay runs a separate headless re-simulation, not a replay of real-game events.

**Debug infrastructure.**
- `HOMING_DEBUG` converted to silenceable: `setHomingDebugSilenced(silenced: boolean)` + `isHomingDebug()` exported from simulation.ts. Game.tsx silences when `gameStatus !== 'playing'`.
- Exported `findPathBFS` and `getTilesAlongLine` from simulation.ts (Game.tsx consumes them for replay).

**Test status.** 237 passing, 44 goldens. Corpus case 17 regenerated intentionally (pathfinding MOVE TOWARD fix). No other golden changes.

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
