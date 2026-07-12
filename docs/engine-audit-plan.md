# Engine Behavioral Audit — Cross-Path Stress Test Plan

*Created 2026-07-12 after a run of "this system NEVER worked" discoveries.
Goal: stop finding these by accident.*

## The bug signature

Every major silent failure found recently has the same shape: **a feature
that works through one path but silently does nothing through parallel
paths that were never exercised.**

| Bug (all found 2026-07-11) | Worked | Silently broken |
|---|---|---|
| Status effects gating actions (`8ddaacb`) | Heroes | ENEMIES — the turn-loop wrapper dropped `statusEffects`, so stun/sleep/silence/disarm/slow/charm never gated enemy actions |
| Death drops (`c697920`) | Projectile kills, DOT deaths | Melee, cone, AOE, contact, tile damage, push — `applyDamageToEntity` never called the drop handler |
| Charm on intent spells (Phase 2) | — | Double-flip made charm a no-op for status spells |
| Persistent zone damage (Phase 2) | Hero-cast zones | Enemy-cast zones damaged the wrong side |
| Enemy resurrectors (Phase 2) | Hero resurrect | Enemy-cast raised dead HEROES |

The engine grew hero-first, with enemies acting through field-by-field
wrapper objects, and damage/death flowing through several parallel
pipelines that each evolved independently. Features get wired into the
path the authoring feature used, and the other paths silently miss out.

## The axes

Every authorable feature implicitly claims to work across these axes.
Bugs live in the untested combinations:

1. **Actor**: hero / enemy (via turn-loop wrapper) / enemy (via trigger
   wrapper) / summon / charmed unit / vessel
2. **Delivery** (for anything damage-adjacent): melee / cone / AOE /
   projectile (immediate + deferred-visual) / contact / tile damage /
   DOT (poison etc.) / persistent zone / push collision / deflect
   reflection / explosion
3. **Timing**: immediate death vs deferred projectile death
   (`pendingProjectileDeath`) vs status-tick death
4. **Mode**: visual game (`resolveProjectiles`) vs headless solver
   (`updateProjectilesHeadless`) — the determinism requirement says these
   MUST agree

## Method

The scratch-test pattern that caught both 2026-07-11 bugs: a minimal
`executeTurn` end-to-end scenario per (feature × axis) cell, asserting the
OBSERVABLE outcome (entity moved / dropped / died / statused), never the
internals. Each sweep below becomes a describe block in a dedicated
`__tests__/audit-*.test.ts` file; failures become fix commits with the
test as the pin.

## Prioritized sweeps

Ordered by (likelihood of live bugs × player impact). Check off as swept.

- [x] **Death triggers × kill path.** SWEPT 2026-07-11
  (`__tests__/audit-death-triggers.test.ts`, 25 tests). Trigger firing
  itself was solid on every delivery (melee/cone/AOE/push/projectile
  visual+headless/contact/tile/DOT/deflect/zone, hero + enemy victims,
  once-only under multi-kill). ONE real bug found and fixed: mid-action
  feedback damage (a victim's on_death spell striking its killer) was
  silently discarded by all three actor loops' copy write-backs — the
  trigger-phase copy-back could even UN-kill the attacker. Fix = external
  health-delta merge in simulation.ts (character loop, enemy loop, both
  trigger-phase blocks). Note for authors: trigger config only exists on
  executionMode 'parallel' actions; a hand-authored sequential+on_death
  action WOULD execute as a normal turn action (editor can't produce
  this; left as-is).
- [ ] **Status effects on ENEMIES, per effect.** `8ddaacb` fixed the
  wrapper; now verify each effect actually behaves for enemy actors:
  slow (skip cadence), haste, shield absorb, deflect, reflect, stealth,
  invulnerable, priority, polymorph visuals aside — logic only.
- [ ] **Enemy spell bookkeeping.** Cooldowns and maxUsesPerGame for
  ENEMY casters across chained/linked actions and REPEAT loops (the
  wrapper copies spellCooldowns back — spellUseCounts too?).
- [ ] **Contact damage matrix.** Walker-into-target × (hero→enemy,
  enemy→hero, summon→hero, hero→vessel), plus priority (PRIORITY status)
  ordering and contact-damage-on-BOTH collisions.
- [ ] **Heal/resurrect caps.** Healing respects max health for enemies
  healed by enemies; resurrect health percent; heal targeting a vessel.
- [ ] **Backstab + crit from enemy attackers.** Authored on enemy spells —
  does isAttackFromBehind fire for enemy casters through the wrapper?
- [ ] **Headless/visual parity per feature.** For each: summon, necromancy,
  vessel transform, drops, persistent zones — run the same scenario through
  testMode/headless and visual-path executeTurn; compare final states.
  (The validator's authority depends on this.)
- [ ] **Pierce/bounce/homing edge re-verification against summons.**
  Mid-flight projectile vs an entity appended THIS turn (spawn-turn
  hittability is asserted in design; is it pinned for every projectile
  style?)
- [ ] **Tile behaviors × enemy actors.** Pressure plates, damage tiles,
  teleports, ice — most tile tests likely exercise heroes; do enemies
  (and summons) trigger/suffer them identically?
- [ ] **Collectible pickup permissions × actor.** Enemy pickup, grace
  periods, thrown-item ownership — especially for summons (whose party
  is not their array side).

## Rules of engagement

- One sweep per session-chunk, corpus green between sweeps.
- A found bug gets its own commit (fix + pin test), never batched.
- Fixes must not change pinned behavior — if a "fix" flips a corpus
  case, STOP and surface it to the user first (it may be load-bearing).
- Sweep tests live permanently; they ARE the regression suite for the
  axes going forward.
