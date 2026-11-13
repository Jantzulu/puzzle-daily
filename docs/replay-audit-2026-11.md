# Replay accuracy audit (2026-11-13)

Rule being audited (user, 2026-10-18): **replay must show exactly what
happened.** Prefer playing back what the engine recorded over re-deriving it.

## How it was checked

A probe drove the real per-frame visual function (`updateProjectiles`) with
fake timers at 16 ms frames, for the live run and for replay, across all 22
corpus cases plus 21 hand-built variants, and compared what would be drawn
each frame (position, presence, facing, shrink, health-bar timing).

Limits, stated plainly:

- **Nothing was run in a browser.** `drawProjectile` was mirrored in the
  probe, not called. Every "live picture" below is what the code computes,
  not what anyone watched. Check a finding in the real game before acting
  on it, especially the ones that say the LIVE game looks wrong.
- The probe is kept at `docs/replay-visual-probe.test.ts.txt` (a .txt so the
  test runner ignores it); renamed into `src/engine/__tests__/` it is
  reusable as a frame-level test.

## The 9 cases the field-level parity test flags

`src/engine/__tests__/replay-parity.test.ts` compares three fields
(`tilePath`, resting position, `hitTileIndex`). The frame-level probe shows
that ruler is rough: 4 of its 9 flags are not visible, and it passes one
case (13) that is visibly wrong.

| Case | Verdict | What differs on screen |
|---|---|---|
| 04 wall hit, short flight | REAL, minor (~0.2 s) | Live: bolt appears on the wall tile and shrinks. Replay: flies from the caster while shrinking. |
| 09, 10, 11 straight homing, final turn | Not visible | Zero frame differences. The live `tilePath` there isn't used to draw. |
| 12 reflect, non-homing | REAL | Replay drops the reflected bolt at the turn boundary; the caster's bar drops a turn late. Frozen T1 parks the bolt 3 tiles past the reflector. |
| 14 wall bounce | REAL | Replay flies to the wall and vanishes. (The probe says live also disagrees with the logic here; unverified, see below.) |
| 15, 18 pierce on the final turn | REAL, minor | Replay stops the bolt on the last enemy; live flew on two more tiles. |
| 16 grid homing, moving target | Not visible | Live never draws the fractional resting position. Frozen facing differs at T2. |

## Beyond the 9

Found by the probe's variants:

1. **Straight-homing reflect (corpus case 13).** Replay sits the bolt on the
   caster ~100 ms; live flies out and back over ~840 ms.
2. **Non-homing reflect on a later turn than the cast.** Replay skips the
   approach and lands the return hit a turn early.
3. **Homing bolt stopped by a wall.** Replay pops it at the wall for 125 ms;
   live flies to the tile before the wall.
4. **Turn-boundary race.** A landing at exactly 800 ms is lost if no frame
   runs at or after 800 ms before the next turn is built. On the FINAL turn
   replay freezes after one interval, so with unlucky frame timing a replay
   can end with the bolt one frame short and the target still shown alive.
   Live doesn't have this: the board keeps animating after the game ends.
5. **Frozen replay (step back / seek) on any hit turn** shows the moment
   BEFORE landing: bolt on the hit tile, target alive. Frozen bolts also
   keep the caster's facing.
6. **Other bounce modes** (turn left/right, bounce on a later turn): same
   shape as case 14.

Where the probe says the LIVE game itself disagrees with the logic
(UNVERIFIED, mirror-only; look in the real game first):

- A wall-bounced bolt drawn standing still on the bounce turn, because
  non-homing bolts slide first tile to last tile of their path.
- Diagonal non-homing shots drawn √2 slower than the logic, so hits land
  after their logical turn.
- A short-flight wall hit drawn as a pop inside the wall tile.

## Two ways to fix it

**A. Patch each gap** by recording more in the event timeline (the
`homing_move.tilePath` approach): a linger flag on end events, a path event
on bounce, a `pierceStop` flag on hits, and indexing reflected paths from the
reflect turn. Recording-only, golden-safe, four or five small changes, and
each new bolt behavior needs its own patch later.

**B. Stop rebuilding bolts.** Each turn's snapshot already holds the engine's
own projectiles; replay throws them away only because their clocks are stale.
Keep them and shift their clocks by (replay now minus the live turn's start).
The probe did this and got **zero frame differences on all 22 cases and all
21 variants**, including every broken case above. It needs one recorded
number per turn (when the turn was resolved) and the final turn to keep
animating until no bolt is left. Frozen mode was not tested with it.
`buildReplayProjectiles` stays as the fallback for runs with no live capture.

B is the "record, don't re-derive" rule taken to its end, and it is the
recommended direction. It is a replay redesign, so it wants its own session:
re-run the probe as a committed test, then check frozen mode and the three
live-picture questions in the real game.
