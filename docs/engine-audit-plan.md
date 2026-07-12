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
- [x] **Heal/resurrect caps.** SWEPT 2026-07-12
  (`__tests__/audit-heal-caps.test.ts`, 10 tests). ONE bug fixed: enemy
  SELF-heals (targetSelfOnly) were uncapped — applySpellToSelf's shape
  check read the hero-shaped wrapper as a character, found no asset, and
  skipped the clamp. Fixed with the char-then-enemy id fallback. All
  other paths capped correctly: AOE heals (both sides, party-isolated),
  healing projectiles (both directions), vessels (adapter max), summons
  (enemy-asset max), resurrect percent (both caster sides). Side-finding:
  `executeHeal` in actions.ts is dead code (no callers), like
  `markEntityAsDead` in simulation.ts.
- [x] **Backstab + crit from enemy attackers.** SWEPT 2026-07-12
  (`__tests__/audit-backstab.test.ts`, 5 tests). NO bugs — the 2×
  multiplier fires for enemy melee and enemy projectiles through the
  wrapper (attack direction + target facing are both shape-independent).
  Current design noted: cones have no crit site; backstab is melee +
  projectile only.
- [x] **Headless/visual parity per feature.** SWEPT 2026-07-12
  (`__tests__/audit-parity.test.ts`, 8 scenarios compared on normalized
  snapshots). TWO bugs fixed, one root (deferred projectile deaths):
  (1) processVesselTransforms keyed on the committed `dead` flag, which
  only the RENDER loop sets for projectile kills — projectile-smashed
  vessels hatched on different turns per mode (never, in headless-style
  runs); now keyed on logically-dead + diedOnTurn. (2) headless
  applyEntityHit never re-stamped diedOnTurn to the visual-death turn
  (N+1), so corpse-blocking windows ran a turn early in the validator;
  now stamped like visual. Corpus stayed green. Parity holds for:
  projectile duels, duration summons, necromancy, vessel transforms,
  death drops, enemy zones, thorns grind, per-turn corpse pathing.
- [x] **Pierce/bounce/homing edge re-verification against summons.**
  SWEPT 2026-07-12 (`__tests__/audit-projectiles-vs-summons.test.ts`,
  4 tests). NO bugs — a summon appended mid-turn is hit by an in-flight
  straight bolt, pierced through by a pierce bolt (rear target still
  reached), correctly IGNORED by a locked homing bolt (single-target by
  design), and the interception is headless-parity clean.
- [x] **Tile behaviors × enemy actors.** SWEPT 2026-07-12
  (`__tests__/audit-tiles-enemies.test.ts`, 6 tests). Enemies ride
  damage tiles, teleports, ice, direction-changes, and pressure plates
  identically to heroes (all through moveCharacter). ONE bug fixed:
  damage-once dedupe keyed by characterId, which for enemies is the
  SHARED enemyId — every same-asset duplicate after the first crossed
  free. Fix = deterministic per-instance `instanceKey`
  ('enemy#<index>'/'char#<index>') stamped by the executeTurn loops,
  carried by all three wrappers, used as the dedupe key.
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
