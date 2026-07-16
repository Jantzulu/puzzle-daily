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

- [ ] **BUG/POLISH — "Loading sprites" state: opaque fill + missed
  entrance animations.** Two symptoms on the play page: (1) while the
  "loading sprites" text shows, the whole puzzle area has a solid fill —
  should be transparent so the page background shows through; (2) spawn /
  board-intro animations can start (or partially burn) before the puzzle
  is actually visible, so players miss them. Note `entrancesRevealed`
  gating (`590a0b6`) already exists for enemy entrances tied to
  spritesReady — investigate what's still slipping through (hero
  entrances? portcullis? board fade?) and gate ALL intro motion behind
  load. *Captured 2026-07-16.*

- [x] **POLISH — Slow the portcullis open/close animation further.**
  **Done 2026-07-16** (`b2ffc48`): open 0.9s → 1.2s, close 0.8s → 1s,
  all four lockstep sites (gate open/close, rail ride pair, visibility
  delay). Second pass after e699bbe. *Captured 2026-07-16.*

- [ ] **FEATURE — Optional attack-animation-while-moving.** Current rule:
  if an entity attacks while moving, the walking animation always plays.
  Keep that as the default, add an opt-in to play the attack animation
  instead. DECIDED 2026-07-16: toggle lives PER ENTITY, in the
  animation selector. *Captured 2026-07-16.*

- [ ] **POLISH — Smooth hero/enemy selection transitions on the play
  page.** Switching selection snaps instantly. DECIDED 2026-07-16: the
  highlight ring AND the arrow underneath should physically SLIDE from
  the old selection to the new one — smoothness is the bar. *Captured
  2026-07-16.*

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

- [ ] **Anti-projectile spells — "wind wall" (DESIGN LOCKED
  2026-07-16).** A standing zone that destroys projectiles flying
  into/through it. User rejected bolt-vs-bolt interception and sweep
  models as too complicated — the persistent-zone model is THE design.
  Locked: default eats HOSTILE projectiles only, with a per-spell
  option to eat ALL projectiles (both offered as options). Likely
  vehicle: the existing persistent-zone system grows a
  "destroys projectiles" behavior; enforcement point = the shared
  projectile walkers (a travel step entering a zone tile kills the
  bolt there — same rule in real + headless, solver parity free).
  Remaining smalls at build time: zone shape/duration knobs, kill VFX,
  does a dying bolt still trigger linger (no). *Captured 2026-07-16.*

- [ ] **User-input spell variants.** Extend the existing redirect-direction-
  picker pattern (player chooses at setup) to three more cases, each
  toggleable per-spell:
  - [ ] Pick fired direction of a spell
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

- [ ] **Projectile linger at end of range.** Non-homing projectiles can
  optionally linger on the tile their path would have ended on for a
  variable number of turns. Entities that walk into that tile during the
  linger interact with it the same way they would have if hit during the
  bolt's travel (damage, status effects, etc). Effectively a poor-man's
  AOE persistent area effect tied to a projectile's natural endpoint.
  *Captured 2026-04-27.*

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

- [ ] **Phase 1 — Hallways (render-only).** Valid on ALL FOUR sides.
  AUTHORING MODEL (user's pick): select a specific RENDERED WALL
  SEGMENT in the map editor and mark it as a hallway — NOT a placed
  floor/void tile (user expects this to feel and look better; data
  model = per-wall-segment annotations on the puzzle, keyed by the
  bordering edge tile + side). The marked wall opens and a 1-tile-deep
  corridor renders outward (floor + branched walls), far half
  swallowed by darkness. Not walkable by any entity. EXCLUDED from
  puzzle-bounds sizing math on all devices — allowed to overflow the
  viewport slightly.

- [ ] **Phase 2 — Doors.** Same wall-segment authoring, TOP or BOTTOM
  walls only (invalid elsewhere). Renders the FULL door sprite in
  place of the wall segment (new skin sprite slots). Sprite states:
  closed / opening / open (last opening frame) / closing (opening
  reversed), each optionally a spritesheet. Editor chooses which
  states exist + the starting state. Open/close animation only ever
  plays at puzzle start. Purely cosmetic through phase 3 (nothing
  passes through) — CONFIRMED.

- [ ] **Phase 3 — Hallway + door combined on one segment.** An open
  door shows ~half a tile of darkened hallway through it ("seeing
  barely into a hallway below the puzzle").

- [ ] **Phase 4 — Doors/hallways as INITIAL-SPAWN entrance styles.**
  SCOPE LOCKED 2026-07-16: start-of-game entrances ONLY, not mid-match
  waves (mid-game spawning is a possible later extension, explicitly
  deferred). These become entrance options alongside fly-in / swoop /
  flutter: at puzzle start, an entity walks in from a door or hallway
  instead of fading/flying in. Entrance FAMILIES so the creator
  chooses which entities come from which door/hallway. Rides the
  existing entrance-animation system (render-side theater), NOT
  spawnEnemyMidGame — no engine/win-condition impact.

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
