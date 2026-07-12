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
- [x] **Status effects on ENEMIES, per effect.** SWEPT 2026-07-12
  (`__tests__/audit-enemy-status.test.ts`, 18 tests). NO bugs — the
  `8ddaacb` wrapper fix holds per effect: sleep+wake, silence/disarm
  gating, slow/haste cadence (counters persist through the shared
  statusEffects reference), shield, invulnerable, deflect (melee +
  projectile), hero-reflect vs enemy bolts, sturdy, steadfast, regen
  cap, poison stacks, charm end-to-end. Pinned as-is: STURDY swallows a
  push spell's damage rider along with the push. (Stealth/priority/stun
  already covered in actions/simulation/party tests + sweep 1.)
- [x] **Enemy spell bookkeeping.** SWEPT 2026-07-12
  (`__tests__/audit-spell-bookkeeping.test.ts`, 6 tests). Cooldowns were
  solid (REPEAT cadence, linked same-spell suppression, trigger phase).
  ONE bug found and fixed: the answer to "spellUseCounts too?" was NO —
  none of the three enemy wrappers carried it, so enemy resurrectors
  ignored maxUsesPerGame entirely. Fixed by carrying + copying back in
  all three. Dormant, noted: maxUsesPerGame is resurrect-only in the
  editor AND in the engine's increment logic; other templates check but
  never increment. If the editor ever exposes it wider, move the
  increment out of the resurrect branch.
- [x] **Contact damage matrix.** SWEPT 2026-07-12
  (`__tests__/audit-contact-matrix.test.ts`, 9 tests). ONE bug fixed:
  the walk-in combat branch was shape-gated with no party check — a hero
  fought its OWN hero-party summon on contact, and a charmed hero kept
  brawling enemies. Fixed with an isAttackTarget gate (non-hostile
  walk-in = block, not fight). Covered: mutual exchange, move-in-on-kill
  (no corpse counter), PRIORITY first strike, charmed targets, vessels.
  **RESOLVED 2026-07-12 (user decision, implemented same day):** contact
  damage is now purely REACTIVE and UNIVERSAL — a stationary holder's
  spikes bite any hostile that tries to walk onto its tile, every
  attempt (lethal to dumb walkers by design), all shapes/parties;
  defender-effective vs mover-base hostility so charm moves spikes'
  allegiance. The walker's own contact damage was REMOVED (mutual
  exchange + PRIORITY ordering + move-in-on-kill are gone; a living
  defender always blocks). Offensive contact returns later as a
  behavior-sequence action — see docs/feature-backlog.md. Side-finding
  flagged separately: MOVE_LEFT/RIGHT/DIAGONAL_* action types have UI
  tooltips but NO executeAction case — they silently no-op.
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
