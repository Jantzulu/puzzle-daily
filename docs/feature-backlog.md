# Feature Backlog

Captured ideas, bugs, and polish items — the raw, working list of things to
do, complementary to [`feature-roadmap.md`](../../puzzle-game/feature-roadmap.md)
(which lives in user memory and tracks formally-approved features).

**How items flow:**
- Items get captured here as they come up in normal use
- Triaged into tiers (launch-blocking → launch-adjacent → post-launch)
- When we decide to actually build something, it graduates to the roadmap
  or just gets done and crossed off
- Items needing clarification get tagged so the design questions are
  visible without blocking the rest of the list

**Tier definitions:**
- **Launch-blocking** — the game's quality, trust, or core workflow
  suffers without this. Should land before going public.
- **Launch-adjacent** — small wins that polish the experience but don't
  gate launch. Land them when convenient.
- **Post-launch** — real features for a future update. Worth doing,
  not now.

---

## Launch-blocking

- [x] **Playtest page parity with Play.** ~~Many features added to the
  player-facing "Play" route over the past months (replay system, etc.)
  didn't backfill into the editor's playtest mode.~~ **Done 2026-04-28**
  via unification rather than porting. Game.tsx grew three optional
  props (`puzzle`, `onExitToEditor`, `onTurnExecuted` — commit
  `95a0351`). MapEditor's playtest now mounts `<Game/>` with the
  in-progress puzzle (`9c4e2a6`). Embedded game loop + UI stripped
  (`9c037e5`, `-935` lines). Orphaned state/handlers cleaned up
  (`a2ed7f7`, `-551` lines). Future Game.tsx features automatically
  benefit playtest with no porting tax. Combat-log sidebar deferred
  to a small follow-up via the `onTurnExecuted` callback.

- [x] **Click already-placed units to re-read their info.** **Done
  2026-04-27** in commit `0d69788` — removed `isPlaced` from the
  click-blocker so clicking a placed hero card opens the info area.

## Launch-adjacent

- [x] **Auto-target distance always inherits trigger range.** **Done
  2026-04-28** in commit `1f2f947` (with a small design adjustment from
  the original framing). Final design: autoTargetRange UI control stays
  available for ALL contexts (was character-only), and auto-seeds from
  trigger.eventRange when an "in range" trigger event is selected. Dev
  edits to autoTargetRange are sticky (explicit value wins over future
  trigger.eventRange changes). RESURRECT path also picks up the
  inheritance fallback at the engine level.

- [x] **Adjustable scale/position for objects in tile + preview.** **Done
  2026-04-30** in commits `506918d` (fields + sliders + render) and
  `0e08b68` (live preview tile). Took the simpler "object-level fields"
  approach (Option A) rather than surfacing per-state CustomSprite
  controls — three new optional fields (`scale`, `offsetX`, `offsetY`) on
  `CustomObject`, with sliders in the Positioning panel and a 120×120
  preview tile that mirrors the exact renderer math. Defaults preserve
  prior behavior exactly. User-validated end-to-end (placed in a puzzle).

- [x] **TypeScript error backlog squash.** **Done 2026-04-30 to 2026-05-01**
  across 15 commits (`4ce2d7a` through `89fc990`). 267 → 0 errors. Tests
  stayed at 237/237 throughout, 44 corpus goldens unchanged. Surfaced and
  fixed 25 real runtime bugs in the process — most notably 4 sprite
  preloaders that were complete no-ops, the tile direction-change angle
  180 silently behaving like 90, applySpellToSelf healing never modifying
  currentHealth, the no_damage_taken quest never completing, and the
  long-flagged turnTiles scoping bug in resolveProjectiles. See
  CLAUDE_HANDOFF.md "Recently completed (April 30 – May 1, 2026 — TS
  error squash campaign)" for the full breakdown.

- [x] **Extract preloader helpers into shared module.** **Done 2026-04-30**
  in commit `a1a07d2`. `collectPuzzleAssetUrls(puzzle)` extracted to
  `src/utils/spritePreload.ts`. Game.tsx and MapEditor.tsx share the URL
  walk; each call site keeps its own loader (`preloadImagesEager` vs
  `preloadImages`). Latent missing-`skin.customTileSprites` gap in
  MapEditor's old preloader closed in the unified function.
- [ ] **(Original entry, kept for context):** Surfaced during
  the TS error squash campaign: MapEditor.tsx and Game.tsx had identical
  duplicated preloader logic, and identical duplicated bugs in it (5+
  wrong field names — spell.projectileSprite vs spell.sprites.projectile,
  currentPuzzle.objects vs placedObjects, the wrong border-key list,
  TileSprites.floor vs empty). The duplication clearly happened when
  Game.tsx was originally split out from MapEditor and has been silently
  drifting since. Extract `preloadPuzzleAssets(puzzle)` into
  `src/utils/spritePreload.ts` so the two callers share one implementation
  and can't drift again. Not blocking — both copies are now correct as of
  the squash campaign. Do whenever the next preload-related change comes
  through. *Captured 2026-05-01.*

## Launch-adjacent (captured 2026-07-16 batch)

- [x] **FEATURE — Install "Modern Antiqua" Google Font.** **Done
  2026-07-16** (`8e5f52c`), all five registration spots, load verified
  in-browser. *Captured 2026-07-16.*

- [x] **FEATURE — Gate-menu button font themeable in settings.** **Done
  2026-07-16** (`e6206e6`): new fontFamilyMenu slot ("Menu Font") →
  --theme-font-family-menu, consumed by .nav-gate-item > span with
  Almendra as the var() fallback. Scoped to the gate's steel-plate
  labels; the .nav-pill utility signs still inherit the body font
  (extend to them if the user asks). *Captured 2026-07-16.*

- [x] **BUG/POLISH — "Loading sprites" state: opaque fill + missed
  entrance animations.** **Done 2026-07-16** (`44e8109`). (1) Overlay
  fill removed — background shows through. (2) TWO gating holes found:
  spritesReady flipped false in a parent effect but child effects run
  first, so on a puzzle SWAP the board initialized entrances with the
  stale reveal and they burned behind the overlay (skipped at reveal —
  the "sometimes" case); now derived (readyPuzzleId === puzzle.id) so
  it reads false the same render the puzzle changes. (3) Character
  spawns had NO entrancesRevealed gate (enemy-only since 590a0b6) —
  now mirrored. AWAITING USER VERIFY on deploy (slow-network case).
  *Captured 2026-07-16.*

- [x] **POLISH — Slow the portcullis open/close animation further.**
  **Done 2026-07-16** (`b2ffc48`): open 0.9s → 1.2s, close 0.8s → 1s,
  all four lockstep sites (gate open/close, rail ride pair, visibility
  delay). Second pass after e699bbe. *Captured 2026-07-16.*

- [x] **FEATURE — Optional attack-animation-while-moving.** **Done
  2026-07-16** (`35ed96b`): sprite-level `castingWhileMoving` flag,
  checkbox in both casting sections of the sprite editor (one flag
  covers all directional states). Draw priority flips to casting >
  moving > idle only under the opt-in; legacy rendering unchanged;
  contact-damage reactions stay stationary-only. AWAITING USER TEST
  with a real attack sheet. *Captured 2026-07-16.*

- [x] **POLISH — Smooth hero/enemy selection transitions on the play
  page.** **Done 2026-07-16** (`9fdaa18`): shared SlidingSelection
  overlay — strip-level tint + caret translate between slots (300ms,
  transform/opacity only, slot-unit math). Ally strips got a copper
  caret (was blood). Geometry verified live; the actual glide needs a
  2+-card puzzle — user verifies on deploy. *Captured 2026-07-16.*

- [x] **BUG — Map editor mobile: puzzle title clipped at top + oversized
  editor tabs.** **Done 2026-07-16** (`facf4ff`). Root cause of the
  clip: .theme-root h1 forces font-size (heading setting × 2) but
  text-lg's fixed 28px line-height survived, and truncate's
  overflow:hidden cut the glyph tops — leading-normal makes the line
  box track the themed size. Tabs: text-xs/px-2.5/py-1 below md.
  AWAITING USER VERIFY on a phone (page is login-gated). *Captured
  2026-07-16.*

- [x] **BUG — Quest panel mobile: (?) help icon wraps onto its own line
  above the quest when the quest text is long.** **Done 2026-07-16**
  (`a6b3e06`): icon + shimmer container share one non-wrapping flex
  group (min-w-0), so only the quest text wraps. Verified at 375px
  with a forced 3-line quest. *Captured 2026-07-16.*

## Post-launch features

### Spell system extensions

- [x] **Anti-projectile spells — "wind wall" — SHIPPED 2026-07-16**
  (`8c53bc1` engine + `5b1d167` editor UI). Persistent-zone model as
  locked: `destroysProjectiles: 'hostile' | 'all'` on
  PersistentAreaEffect, authored via persistDestroysProjectiles on any
  persisting AOE spell ("Destroys Projectiles" select in the builder;
  damage-0 = pure screen). Enforced in the SHARED walkers
  (walkNonHomingTick entry check before entity hits; planHomingTick
  zone_kill plan on advance + reach legs — a zone on the target's tile
  screens the target) → real/headless parity by construction, 10 pins
  in wind-wall.test.ts. Bolts die where they enter; visual stops AT
  the kill tile. THROW_PLACE exempt (items, reflect's carve-out).
  Deliberately out of scope: reflected return legs ignore zones (rare
  compound; own session if wanted); no dedicated kill VFX yet (despawn
  shrink covers it). AWAITING USER TEST with a real authored wall.
  *Captured 2026-07-16.*

- [ ] **User-input spell variants.** Extend the existing redirect-direction-
  picker pattern (player chooses at setup) to three more cases, each
  toggleable per-spell:
  - [x] **Pick fired direction of a spell — SHIPPED 2026-07-17**
    (`ce989e0` engine + solver + 6 parity pins in
    spell-direction-input.test.ts, `ee3f342` editor checkbox + hero-card
    compass + "Aimed Spell" help section).
    `SpellAsset.directionAcceptsUserInput` on any non-redirect template;
    the choice rides the SAME `spellDirectionOverrides` slot as redirect
    input, so placement stamping, persistence, setup recovery, solver
    permutation (8^N), and the validation modal all worked unchanged.
    Aimed direction beats every authored source incl. auto-target;
    honors faceTargetOnCast; enemies/AI (and un-aimed heroes) fall back
    to the authored direction config. Homing deliberately not engaged.
    AWAITING USER TEST with a real authored spell. Note (mirrors
    pre-existing redirect behavior): an untouched compass DISPLAYS
    north but the engine falls back to the authored config until the
    player clicks — flag if this ever confuses.
  - [ ] Pick initial facing of a placed hero (heroes currently have a
    hardcoded starting facing baked into the asset, e.g. "Bob always
    starts facing south"). When toggled on, the player picks at placement.
  - [ ] Pick which spell to use when a hero has multiple in the same
    behavior slot (creator authors several options, player picks one per
    run).

- [x] **Multi-tile melee sprite stitching.** SHIPPED d233430 (2026-07-11) — begin/end sprite slots in spell builder, middle = existing Attack Appearance; also added single-sprite AOE mode (aoeSingleSprite) same commit. Currently a melee attack with
  range > 1 just repeats the single damage sprite per tile. Add the option
  for a creator to author "beginning / middle / end" sprite parts for an
  attack so e.g. a 3-tile lunge looks like a single long sword (start of
  blade → middle → tip). For range 1 the existing single-sprite path stays;
  for range 2 use beginning + end; for range 3+ middle is repeated.
  Creator-specified per part, not auto-derived. *Captured 2026-04-27.*

- [x] **Projectile linger at end of range — SHIPPED 2026-07-16**
  (`239804f` engine + `2eb6d48` visual/UI). SpellAsset.lingerDuration
  ("Linger at End of Path" in Projectile Settings): an UNSPENT
  non-homing bolt (hit nothing; range end or wall stop — not bounds,
  reflect, or wind-wall kills) drops a SINGLE-TRIGGER hazard on its
  final tile. First opposing walker takes the bolt's hit (damage
  stamps 'any' like tile damage + on-hit status + drops on kill);
  own side passes; expires after N full post-landing turns. Trigger
  rides the move loop's per-step site (covers ice-slide stops +
  teleport arrivals); creation on shared walker outputs in both
  modes → parity by construction, 7 pins in
  projectile-linger.test.ts. Visual: projectile sprite resting on
  the tile (amber glint fallback). Deterministic ids. AWAITING USER
  TEST. Original spec: *Captured 2026-04-27.*

### New entity types & summoning

- [x] **Summon spell type.** SHIPPED 2026-07-11 (`c532de3`→`136bd3e`):
  spawn mechanics + win exclusion + party inheritance (effective party at
  cast time — charm converts permanently), materialize/exit overlays
  (particle `aboveEntities` pass), optional duration (expiry despawn ≠
  death), per-spell overrides (facing incl. relative-to-summoner; starting
  status covers contact damage — it IS a CONTACT_DAMAGE status), full
  editor UI in the spell builder. Original spec follows.
  Spawns another entity on adjacent tiles.
  Behavior:
  - Some kind of "summon" effect (portal animation) and a transition
    animation on the summoned entity
  - Summoned entity inherits the summoner's party
  - Summoned entity does *not* count toward win conditions
  - Optional turn duration; on expiry, dies or despawns with a transition
  - Summoned entity inherits its base properties from the source asset, but
    direction, contact damage, and starting status effect can be
    overridden per-spell
  - Direction overrides include all 8 fixed directions PLUS relative-to-
    summoner directions (e.g. "summoned entity faces away from summoner
    along the spawn axis").

  *Captured 2026-04-27.*

- [x] **Necromancy spell type.** SHIPPED 2026-07-11 (`4f0b0da`): raises
  nearest opposing-party corpse(s) as NEW win-exempt combatants on the
  caster's side; corpse consumed (single-raise); shares all summon
  overrides + resurrect's health-percent; editor UI in the spell builder.
  v1 limitation: only corpses in the enemies array can rise — dead
  HEROES can't be raised yet (character-shaped combatants in the enemies
  array are a shape landmine). Original spec: like resurrect, but for
  *opposing-party* dead units. *Captured 2026-04-27.*

- [x] **"Allies" entity class.** — SHIPPED 2026-07-13 (`cbe3b5c`→`0863225`,
  6 slices). Separate asset type (user's pick over an enemy flag):
  CustomAlly in own storage namespace, vessel-precedent adapter into the
  enemy pipeline, placements stamped `party: 'hero'` (the shipped party
  model needed ZERO ally-specific engine code — pinned in allies.test.ts).
  Parameterized EnemyEditor (assetKind='ally'), Allies tab in the asset
  manager, Allies palette section in the map editor, Slab chapter (heroes
  accent until style pass), cloud sync under 'ally' (no migration — 012
  covers it). Original spec: friendly to heroes, creator-placed, own
  behavior tree, win-condition references. *Captured 2026-04-27.*

- [x] **"Noble" marker for heroes/allies.** — SHIPPED 2026-07-13 with the
  Allies slices. isNoble on ally assets AND hero Characters (editor
  checkboxes both places). Three authorable conditions (user's pick over
  an auto-defeat marker): protect_noble, noble_survives_turns,
  noble_reaches_goal (reuses the GOAL tile) — uniform implied-protect
  rule: any noble condition makes a Noble death instant defeat. Quest
  labels name the placed Nobles. Board markers: noble crown / ally shield
  next to health bars (boss-skull mechanism generalized; placeholder
  pixels + Panel Forge slots iconNobleHealthBar/iconAllyHealthBar await
  real art). Known limitation: trigger-EVENT semantics in ally behaviors
  are enemy-authored wording/logic — revisit if an ally needs reactive
  triggers. *Captured 2026-04-27.*

### New gameplay mechanics

- [x] **VESSELS — dedicated breakable asset type** — SHIPPED 2026-07-11
  (`f6b4d3f`→`b010238`, all five slices: engine foundation, VesselEditor,
  map placement, Slab chapter, cloud sync + migration 012). AWAITING
  USER: paste migration 012, test in editor + game, style pass on the
  Slab chapter (shares enemies accent) and the sprite-editor guidance
  approach. Original redesign spec follows. (REDESIGNED 2026-07-11,
  supersedes the "breakable container" enemy-variant idea; name "Vessel"
  chosen by user). A static thing with HP that may transform into an
  enemy when broken: barrels, urns, crates, mimic chests, hatching eggs,
  awakening statues.

  Locked design (2026-07-11):
  - Own ASSET TYPE with its own editor panel under dungeon details and
    its own section in The Slab (not a special enemy)
  - Never moves, no actions, no movement direction arrow
  - Variable health (some vessels are harder to break)
  - Sprites: idle + death animations ONLY (no directional movement
    sheets, no spawn anims, no spell anims)
  - v1 triggers: transform on DEATH (HP to 0) + TIMED (end of turn N —
    hatching egg / timed ambush). Source-specific triggers later
  - Win conditions: rides the shipped designer curation
    (params.excludedEnemyIds) — a decorative barrel gets unchecked; the
    burst-out enemy counts like any authored enemy (continuity emerges
    naturally: vessel counts until transform, then its dead+consumed
    entry satisfies the check and the spawned enemy takes over)

  Architecture (agreed direction): vessels adapt into the ENEMY pipeline
  under the hood — placed into puzzle.enemies with the vessel's id, and
  getEnemy()/loadEnemy() fall back to an Enemy-shaped adapter over the
  vessel registry (health, no behavior, idle/death sprites, drops). The
  engine stays untouched except an end-of-turn transform processor
  (mirrors processSummonExpiry): dead-or-timer-elapsed vessels are
  CONSUMED (despawned) and the nested enemy spawns on their tile via
  spawnEnemyMidGame (NOT win-exempt; asset defaultFacing or per-vessel
  override; summon overlay language reusable for the burst). A vessel
  with no nested enemy is a plain breakable (normal death, drops fire).

  Slices: (1) type + storage + getEnemy adapter + engine transform
  processor + tests; (2) VesselEditor panel + editors page entry;
  (3) map editor placement palette; (4) The Slab section; (5) cloud
  sync (needs the asset-kind plumbing checked). *Captured 2026-04-27,
  redesigned 2026-07-11.*

- [x] **Team-relative trigger events + REPEAT_UNTIL behavior block —
  SHIPPED 2026-07-14** (`c919888` relative events + read-time mapping,
  `2602197` REPEAT_UNTIL with segment semantics, `4ce8d7e` rich condition
  vocabulary — health/noble/counts/turn/goal/repeated_times). The ally
  triggered-action bug is fixed. Remaining follow-up, pre-briefed in
  CLAUDE_HANDOFF.md "Next session — start here": **hit-stamp conditions**
  ("hit by / landed a melee/projectile/contact hit" with previous-action /
  this-cycle / ever freshness windows — user design 2026-07-14; touches the
  shared damage path, own session). Original spec below for reference.*

  **Part 1 — team-relative trigger events (bug-driven).** Trigger EVENTS
  are hard-wired to absolute parties (`checkTriggerCondition`,
  actions.ts ~3883): `character_adjacent`/`character_in_range`/
  `contact_with_character` sense the base HERO party; `enemy_*` sense
  the base ENEMY party. Auto-target FLAGS were made team-relative in
  the July party work, but events were not. Consequence: an ALLY
  (shipped 2026-07-13; enemy-shaped authoring) given a triggered action
  gets the `character_*` events — which fire on its own teammates, and
  since proximity has no self-exclusion, a `character_adjacent` trigger
  on an ally is ALWAYS true (it senses itself at distance 0). Redesign:
  events become team-relative ("Opposing adjacent" / "Same team
  adjacent" / in-range / contact variants), resolved against the
  HOLDER's party the way `findNearestTeamMembers` resolves flags.
  Decisions to lock with the user: BASE vs effective party (existing
  proximity is deliberately charm-blind BASE — recommend keeping);
  self-exclusion for same-team events (required, else useless — a
  deliberate behavior change to pin); legacy event migration (authored
  `enemy_*`/`character_*` events on existing assets must keep meaning
  what they meant — either a read-time mapping via authoring-side or a
  one-time asset migration).

  **Part 2 — REPEAT_UNTIL behavior block (user idea 2026-07-13).** A new
  sequence action: repeats all behavior ABOVE it (like REPEAT) until a
  trigger condition fires — then flow FALLS THROUGH to the actions
  below it. Enables "patrol until you spot an enemy, then switch to
  attacking", escort-walk-until-threatened, flee-below-half-health.
  Should reuse the (redesigned) trigger-condition vocabulary via
  `checkTriggerCondition` directly — NOT the parallel-trigger plumbing
  (editor gotcha: trigger config currently only shows on parallel
  actions; REPEAT_UNTIL is sequential flow). Available to heroes,
  enemies, AND allies (same CharacterAction lists). User explicitly
  wants a RICH condition set ("go crazy with these possible triggers
  to open up more complicated behavior") — beyond the proximity set:
  health thresholds (self/ally/noble), turn number reached, repeated N
  times, standing on a tile type, collectible nearby/collected, wall
  ahead, a Noble in danger, enemy/ally count thresholds... brainstorm
  with the user before building; each condition must stay a pure,
  deterministic function of game state (determinism rule).

### Dungeon dressing: hallways, doors, spawn paths (captured 2026-07-16)

A phased visual-flavor-into-gameplay arc. User's framing: faux
passages "to and from" the dungeon for visual flavor and uneven
geometry, later becoming entrance points for START-OF-GAME spawns.
Design answers locked 2026-07-16.

- [x] **Phase 1 — Hallways (render-only) — SHIPPED 2026-07-16**
  (`cd9f2b0` render + `33e02fc` jambs/no-back-wall + `f80736b` editor
  authoring). Puzzle.hallways = per-wall-segment markers ({x,y,side});
  shared renderer src/utils/hallwayDraw.ts used by BOTH the game's
  baked static layers and the editor canvas. Corridors fit INSIDE the
  border band (48px top/bottom, 16px sides — sizing math untouched):
  skin floor through the opening, procedural jamb walls with lit
  edges, darkness dissolving to pure black (NO back wall — implies
  continuation, user design). Editor: Hallway tool (hotkey 8), click
  a floor edge bordering void/outside, click again to remove; copper
  outlines while tool active; validity shared with renderer so stale
  markers self-skip. First Steps test puzzle carries a demo hallway
  per side. AWAITING USER TEST (editor is login-gated). Follow-ups
  captured below (jamb skin sprites). *Captured 2026-07-16.*

- [x] **Phase 1.5 — Skinnable hallway pieces — SHIPPED 2026-07-16**
  (`cfecabf`). Four CustomBorderSprites slots (hallwayTop/Bottom
  48x48, hallwayLeft/Right 16x48) = the corridor interior as one
  authored piece; darkness still applied in-game (draw art fully
  lit); procedural fallback while absent. Skin editor: slots +
  preview hallways (one per side) + highlight regions. ~~NOTE: side
  corridors stay depth-capped at the 16px side band~~ **RESOLVED
  2026-07-16 (`b922341`)**: side corridors now run 48px deep via a
  canvas overhang excluded from fit-scale math (board size unchanged;
  tails clip on narrow phones). Same rework (`cc01f18`) replaced the
  sliver jambs with the skin's real inner-corner pieces at every
  opening — hallway slots are corridor FLOOR art only now, and
  hallwayLeft/Right slots grew to 48x48 (old 16x48 art stretches).

- [x] **Phase 2 — Doors — SHIPPED 2026-07-16** (`9981f2d`).
  Puzzle.doors {x, y, side: top|bottom, startState:
  closed|open|opening|closing}; skin slots doorClosed/doorOpen
  (48x48) + doorOpening (horizontal strip of square frames, 10fps,
  closing = reversed); procedural plank-door fallback. Open/close
  plays ONCE at board reveal (same gate as entrances — can't burn
  behind loading), replays per board mount. Rendered per-frame after
  the static blit, under entities. Editor: Hallway tool grew a
  Hallway/Door/Door+Hallway mode picker + start-state select; doors
  ride all save/load/cache/undo paths; copper outline + state letter
  while tool active. Skin editor slots + preview doors. Purely
  cosmetic (confirmed). AWAITING USER TEST + real door art.

- [x] **Phase 3 — Hallway + door combined — SHIPPED 2026-07-16**
  (with phase 2, by construction): hallway corridors bake under the
  per-frame door pass, so an open door with a transparent doorway
  shows the corridor behind it. "Door + Hallway" editor mode places/
  clears the pair as one gesture. The First Steps test puzzle's top
  edge demos it (door swings open at load revealing the corridor).

- [x] **Phase 4 — Doors/hallways as INITIAL-SPAWN entrance styles —
  SHIPPED 2026-07-16** (slices `2649dcd` opt-in flags + entersFrom,
  `d6a982b` inspect-popover picker, `2ab630c` walk-in renderer).
  Design locked with user same day: per-placed-entity assignment
  (PlacedEnemy.entersFrom, position+side ref w/ stale self-skip),
  gated behind sprite-level spawnFromDoor/spawnFromHallway checkboxes
  (SpriteEditor Spawn section); BFS pathfind around walls (shared
  findPathBFS); staggered file-out per opening (350ms); door walkers
  wait out the door-opening beat (450ms delay + ~500ms sheet);
  enemies + allies + vessels (heroes keep their entrances). Walk-in
  wins over fly-in; spawn sheet plays on arrival. Render-only refs in
  AnimatedGameBoard, engine/solver untouched. NOT demoable on the
  bundled test puzzle (built-in goblin has no customSprite — opt-in
  lives on user assets). Mid-game waves remain explicitly deferred.

### Hallway dynamics batch (captured 2026-07-17, user-approved brainstorm)

All build on the shipped hallway/door/walk-in arc. Perf rule holds for
the visual items: baked, event-driven, or transform/opacity only.

- [ ] **IDEA — Eyes in the dark.** Game board corridors. Occasional
  pair of tiny eyes blinking deep in a corridor's darkness (2px dots,
  opacity-only, slow randomized timer — render theater, Math.random
  fine). Killer version: eyes appear in the corridor an entity is
  assigned to walk in from, foreshadowing the spawn pre-reveal.
  Relocates the parked "void eyes" flourish idea to its natural home.

- [ ] **FEATURE — Shove-out ejection.** Engine + editor. A push that
  drives an entity through a hallway mouth ejects it from the board
  (despawn semantics like summon expiry — no corpse; deterministic;
  walk/tumble-out theater). Per-hallway editor toggle ("open ledge" vs
  barred). New puzzle verb built from existing push + despawn pieces.

- [ ] **FEATURE — Escape objectives.** Win conditions. A hallway as the
  goal: "guide the Noble out through the east hall" — same condition
  shape as noble_reaches_goal, exit theater reuses walk-out visuals.
  Escort puzzles get a destination that reads on the board.

- [ ] **FEATURE — The passerby.** Enemy/ally authoring. Neutral scripted
  creature crossing the board: DESIGN LOCKED 2026-07-17 — NO new
  pathfinding; the route is a normal authored behavior sequence
  (WAITs, moves, turns). New engine piece = a DEPART action (leave the
  board at/adjacent to a designated opening; despawn, no corpse,
  walk-out theater). Entry = the shipped walk-in assignment. V1 =
  one-shot crossing. V2 = RECURRING CADENCE: per-placement
  {firstTurn, repeatEvery} re-spawn via spawnEnemyMidGame
  (deterministic, turn-keyed) — requires the walk-in theater to fire
  MID-GAME, i.e. the first thin slice of the deferred waves work.
  Recurring visitors must be excludeFromWinConditions.

- [ ] **FEATURE — Deliveries.** A collectible tossed in from a hallway
  on a known turn — timed pickup pressure, board-readable where/when.
  Likely rides the same scheduled-arrival machinery as passerby v2.

- [ ] **FEATURE — Escapes on defeat.** Per-enemy flag: lethal damage
  plays a walk-out through the nearest opening instead of leaving a
  corpse. Logic unchanged (still counts as defeated — pure visual swap
  on the death path, deterministic). LOCKED 2026-07-17: the departing
  sprite is a GHOST — logically dead+despawned the instant the blow
  lands (tile freed, win conditions credited, untargetable, triggers
  nothing), so the walk-out is render-ref theater that crosses occupied
  tiles and mid-fight scenes with zero interaction. Optional style
  knob: slight alpha fade during the exit. Ships independently;
  becomes the boss-escapes hook for the roguelike mode below.

- [ ] **IDEA — Roguelike puzzle sequences (post-launch mode).** User
  vision 2026-07-17: linked chain of puzzles ("rooms"); the hero
  roster persists across the run — survivors advance, dead heroes are
  unavailable in later rooms; HP carry-over is a difficulty dial.
  Hallways/doors are the navigation metaphor: exit a room through an
  opening, next room's heroes walk in from the matching side (walk-in
  theater already shipped). Escaped bosses (flag above) can recur in
  later rooms. Scope: new game mode — sequence linking + run state +
  editor surface; engine plays one room at a time, unchanged.

### Profile / cosmetic

- [ ] **Developer badge in profile.** Special badge shown next to a
  user's name/profile if they're flagged as a developer. Tiny scope — a
  flag on the user's profile + UI rendering. *Captured 2026-04-27.*

---

## Notes for adding new items

When dropping a new idea in:
- Tag it (BUG / FEATURE / POLISH / IDEA)
- Note where it shows up (which screen / route / editor pane)
- One phrase on why it matters
- Don't pre-design the fix — leave that to triage

Items live in the appropriate tier section. Unsure where it goes? Just
drop it under "Captured but untriaged" at the bottom and we'll sort
during the next session.

---

## Captured but untriaged

- [x] **Offensive contact damage — SHIPPED 2026-07-12 as the TRAMPLE
  status effect** (user pivoted from the behavior-action idea to a
  status, same day it was captured). CONTACT_DAMAGE displays as
  "Thorns" (reactive: bites hostile walkers, every attempt); TRAMPLE is
  the offensive half (the holder gores hostiles it walks into, plowing
  through on a kill). Hero-side strikes first in a Thorns/Trample
  trade unless the enemy side has PRIORITY ("this one is faster").
  Both support halt-movement-on-contact (resume next turn / stop
  forever). A behavior-ACTION variant (full trigger/ordering
  flexibility) remains a possible future refinement if the status
  proves too rigid.
