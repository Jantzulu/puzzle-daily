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

## Post-launch features

### Spell system extensions

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
