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

- [ ] **Auto-target distance always inherits trigger range.** This was
  discussed but may have fallen through. Need to verify whether it shipped
  or whether the independent auto-target value is still settable. If still
  separate, remove the independent control and have it always equal trigger
  range. *Captured 2026-04-27.*

- [ ] **Adjustable scale/position for objects in tile + preview.** Same UI
  pattern that already exists for entity sprite sheets. Mostly a port of
  the existing controls. *Captured 2026-04-27.*

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

- [ ] **Multi-tile melee sprite stitching.** Currently a melee attack with
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

- [ ] **Summon spell type.** Spawns another entity on adjacent tiles.
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

- [ ] **Necromancy spell type.** Like resurrect, but for *opposing-party*
  dead units. Likely shares most of the summon and resurrect settings
  (transition animation, party assignment, optional duration). Builds on
  the summon framework once that lands. *Captured 2026-04-27.*

- [ ] **"Allies" entity class.** New entity class — friendly to heroes
  (same team), placed on the puzzle from the start by the creator (like
  enemies — player doesn't place them). Have their own behavior tree
  (move/attack/buff/heal). Can be referenced by win conditions ("Prevent
  King from Dying", "Save the Princess"). Substantial — touches entity
  type system, win conditions, editor UI. *Captured 2026-04-27.*

- [ ] **"Noble" marker for heroes/allies.** Equivalent of the existing
  "Boss" marker but for the friendly side. Designates an entity as
  significant for win conditions like "must win with Noble alive on the
  board." Couples with the Allies class. *Captured 2026-04-27.*

### New gameplay mechanics

- [ ] **Breakable container framework** (e.g., barrel that an enemy bursts
  out of). Implement as a special enemy type that holds a *nested*
  enemyId — the entity it transforms into when triggered. Trigger options:
  - After N turns
  - Any damage taken
  - Specific damage source (spell type, hero, etc.)

  On trigger, the container is replaced by an instance of the nested
  entity, which adopts that entity's normal behavior with optional
  overrides (facing direction, possibly more). Same animation/transition
  language as summon would be reusable here. *Captured 2026-04-27.*

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

*(Empty — all current items triaged.)*
