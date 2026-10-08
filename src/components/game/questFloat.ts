import { useCallback, useLayoutEffect, useRef, useState, type RefObject, type CSSProperties } from 'react';

// ============================================================================
// QUEST FLOAT — EXPERIMENT (user idea 2026-10-08; revert = delete this file,
// the questFloatOn branches in Game.tsx, CharacterSelector's questSlot and
// the .quest-float* CSS)
// ============================================================================
// The quest scroll leaves the page flow: it opens OVER the top of the board
// on every visit to a puzzle ("Tap the scroll to minimize" beneath). A tap
// plays the classic close — roll up, then TUCK (the rolled scroll rides up
// to centre on the QUEST seal) — and TOSSES it along an arc once the
// roll-up is done (the tuck finishes in flight), shrinking to half size,
// into a slot in the hero header (where the Test button sits). Tapping the
// small scroll tosses it back, growing; once it lands it untucks and
// unfurls.
// Pressing Play (or Test) minimizes it. The hero panel and everything under
// it move up by the box's old height.
//
// The placement and the toss live on a wrapper around .quest-box-anchor, so
// the anchor's own glow and bob ride along untouched. Half size is exact:
// the art is drawn at 2×, so 0.5 lands on its native pixels.
//
// TEMPORARY SWITCH: ?quest=float turns it on for this device (remembered),
// ?quest=classic turns it off. Off = today's layout, byte for byte.

export const QUEST_FLOAT: boolean = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('quest');
    if (q === 'float') localStorage.setItem('quest_layout', 'float');
    else if (q === 'classic') localStorage.removeItem('quest_layout');
    return localStorage.getItem('quest_layout') === 'float';
  } catch {
    return false; // no window (tests) / storage blocked — classic
  }
})();

/** The small scroll's size relative to the open one. */
export const QUEST_MINI_SCALE = 0.5;
/** The toss between the board and the hero header. */
export const QUEST_FLIGHT_MS = 700;
/**
 * Minimize: the toss leaves this long after the tap, without waiting for
 * the whole close (user round 8: it "does not have to wait until the
 * scroll is fully rolled up and positioned"; it used to leave at 0.8s).
 * Round 9: 400ms (lifting off at ~97% rolled, the whole tuck in flight)
 * felt slightly too quick, so now the 0.5s roll-up finishes first and the
 * toss leaves a third of the way into the 0.3s tuck, which completes over
 * the flight's slow start. The mini spot is the TUCKED pose, so it still
 * lands centred. Expand keeps its order: land, then untuck and unfurl
 * (round 9: the overlap there was reverted).
 */
export const QUEST_TOSS_AFTER_ROLL_MS = 600;
/**
 * The scroll SPAWNS a beat after the board is ready (user round 5: "delay
 * the initial spawning ever so slightly") — it used to mount with the page
 * and could unfurl over a board still fading in.
 */
export const QUEST_SPAWN_DELAY_MS = 300;
/**
 * The "tap to minimize" hint waits for the scroll (user round 5) and
 * arrives this long AFTER the unfurl has actually ended — its animationend,
 * not a timer from the spawn. User round 6: the timer put the hint's
 * re-render on the unfurl's last frames on a phone (the CSS animations
 * start a little after the spawn timer fires), and there the fade popped
 * in and the objective text flashed. Expanding the small scroll already
 * left ~this beat before 'reopened', and looked right.
 */
export const QUEST_HINT_BEAT_MS = 100;
/**
 * Where the open scroll's BOX top sits below the board's top edge — resting
 * close under the portcullis (user rounds 3 and 10). Measured column by
 * column in the pane (375 wide): the tightest clearance is where two spike
 * tips hang over the QUEST plate's shoulders — the spikes end ~6.4px below
 * the board's top (a px less on desktop) and the plate art rides 10px above
 * the box (the centre ornament, 14px up, sits BETWEEN those spikes). 18
 * leaves ~1.4px there (it was 24: ~7.4px). The bob only ever moves it DOWN.
 */
const STAGE_DROP = 18;
/** How far the toss rises above the higher end of its path. */
const ARC_LIFT = 56;

type Spot = { x: number; y: number };
type Spots = { stage: Spot; mini: Spot | null };

const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/**
 * The toss: a quadratic arc from one spot to the other whose control point
 * rises ARC_LIFT above the higher end — so going down it pops up first and
 * drops into the slot, and going back up it overshoots and settles onto the
 * board. Position and size ease in-out together. NO rotation: the art stays
 * upright the whole way — only the PATH curves (user round 3).
 */
function tossKeyframes(from: Spot, to: Spot, s0: number, s1: number): Keyframe[] {
  const STEPS = 16;
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - ARC_LIFT;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const u = i / STEPS;
    const t = easeInOut(u);
    const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * cx + t ** 2 * to.x;
    const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * cy + t ** 2 * to.y;
    const s = s0 + (s1 - s0) * t;
    frames.push({ offset: u, transform: `translate(${x}px, ${y}px) scale(${s})` });
  }
  return frames;
}

/**
 * Places the float wrapper. Both spots are measured together, every time:
 * STAGE — the .quest-box-anchor's top-left centred over the board,
 * STAGE_DROP below its top; MINI — the TUCKED scroll's centre (the box top
 * plus the seal's art dip, --qseal-dip on the anchor — where the tuck
 * centres the rolled scroll) on the hero header's [data-quest-slot], at
 * QUEST_MINI_SCALE. Re-measures whenever the anchor, the board, the slot
 * or the page column resizes; rects are compared to the column the wrapper
 * is positioned in, so page scroll cancels out. Resting placement is a
 * plain inline transform (instant); a `mini` flip plays the toss on top of
 * it with the Web Animations API — no CSS transition, which would outrank
 * the animation in the cascade.
 */
export function useQuestFloatPlacement(
  active: boolean,
  mini: boolean,
  wrapperRef: RefObject<HTMLDivElement | null>,
): CSSProperties | undefined {
  const [spots, setSpots] = useState<Spots | null>(null);

  const measure = useCallback(() => {
    const wrap = wrapperRef.current;
    const anchor = wrap?.querySelector<HTMLElement>('.quest-box-anchor');
    const col = wrap?.offsetParent as HTMLElement | null;
    const board = document.querySelector<HTMLElement>('.board-rise');
    if (!wrap || !anchor || !col || !board) return;
    const c = col.getBoundingClientRect();
    // The anchor's untransformed spot inside the wrapper (layout px; the
    // wrapper's transform origin is its top-left, so it scales with s).
    const offX = anchor.offsetLeft;
    const offY = anchor.offsetTop;
    const aw = anchor.offsetWidth;
    const dip = parseFloat(getComputedStyle(anchor).getPropertyValue('--qseal-dip')) || 0;
    const toWrapper = (tx: number, ty: number, s: number): Spot => ({
      x: Math.round(tx - c.left - s * offX),
      y: Math.round(ty - c.top - s * offY),
    });
    const b = board.getBoundingClientRect();
    const stage = toWrapper(b.left + b.width / 2 - aw / 2, b.top + STAGE_DROP, 1);
    let miniSpot: Spot | null = null;
    const slot = document.querySelector<HTMLElement>('[data-quest-slot]');
    if (slot) {
      const r = slot.getBoundingClientRect();
      const s = QUEST_MINI_SCALE;
      miniSpot = toWrapper(r.left + r.width / 2 - (aw * s) / 2, r.top + r.height / 2 - s * dip, s);
    }
    setSpots({ stage, mini: miniSpot });
  }, [wrapperRef]);

  useLayoutEffect(() => {
    if (!active) return;
    // No direct measure() here: a ResizeObserver reports every observed
    // element once as soon as observation starts — that first callback is
    // the initial placement.
    const ro = new ResizeObserver(() => measure());
    const wrap = wrapperRef.current;
    const targets = [
      wrap?.querySelector('.quest-box-anchor'),
      wrap?.offsetParent,
      document.querySelector('.board-rise'),
      document.querySelector('[data-quest-slot]'),
    ];
    targets.forEach(el => { if (el) ro.observe(el); });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [active, measure, wrapperRef]);

  // THE TOSS: when `mini` flips, animate between the two spots before the
  // first paint of the new resting transform (a layout effect runs after
  // the DOM update, before paint). Spot re-measures alone never toss.
  const prevMini = useRef(mini);
  useLayoutEffect(() => {
    if (prevMini.current === mini) return;
    prevMini.current = mini;
    const el = wrapperRef.current;
    if (!active || !el || !spots?.mini) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const from = mini ? spots.stage : spots.mini;
    const to = mini ? spots.mini : spots.stage;
    const s0 = mini ? 1 : QUEST_MINI_SCALE;
    const s1 = mini ? QUEST_MINI_SCALE : 1;
    el.animate(tossKeyframes(from, to, s0, s1), { duration: QUEST_FLIGHT_MS, easing: 'linear' });
  }, [active, mini, spots, wrapperRef]);

  if (!active) return undefined;
  const spot = spots && (mini ? spots.mini : spots.stage);
  if (!spot) return { visibility: 'hidden' };
  return { transform: `translate(${spot.x}px, ${spot.y}px) scale(${mini ? QUEST_MINI_SCALE : 1})` };
}
