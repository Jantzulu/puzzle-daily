import { useCallback, useLayoutEffect, useState, type RefObject, type CSSProperties } from 'react';
import { localDateKey } from '../../utils/localDate';

// ============================================================================
// QUEST FLOAT — EXPERIMENT (user idea 2026-10-08; revert = delete this file,
// the questFloatOn branches in Game.tsx, CharacterSelector's questSlot and
// the .quest-float* CSS)
// ============================================================================
// The quest scroll leaves the page flow: it pops open OVER the top of the
// board when a puzzle first loads ("Tap the scroll to minimize" beneath),
// and a tap rolls it up as usual, then flies it — shrinking to half size —
// to a slot in the hero header (where the Test button sits). Tapping the
// small scroll flies it back, growing, and unfurls it again. Pressing Play
// (or Test) minimizes it. The hero panel and everything under it move up
// by the box's old height.
//
// The flight is ONE transform on a wrapper around .quest-box-anchor, so the
// anchor's own glow and bob ride along untouched. Half size is exact: the
// art is drawn at 2×, so 0.5 lands on its native pixels.
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
/** The flight between the board and the hero header (keep in step with .quest-float's transition). */
export const QUEST_FLIGHT_MS = 600;
/**
 * Where the open scroll's BOX top sits below the board's top edge: clears
 * the control rail's hanging spikes plus the QUEST plate riding above the
 * box (tuned in the pane).
 */
const STAGE_DROP = 44;

// First view of each puzzle pops the scroll open; a return the same day
// starts it minimized.
const SEEN_KEY = 'quest_float_seen';

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function questSeenToday(puzzleId: string): boolean {
  return readSeen()[puzzleId] === localDateKey();
}

export function markQuestSeen(puzzleId: string): void {
  try {
    const today = localDateKey();
    const seen = readSeen();
    // Keep only today's entries — the map never grows past a day's puzzles.
    const next: Record<string, string> = {};
    for (const [id, day] of Object.entries(seen)) if (day === today) next[id] = day;
    next[puzzleId] = today;
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch { /* storage blocked — it just pops open again next time */ }
}

/**
 * Places the float wrapper. Both spots are measured together, every time:
 * STAGE — the .quest-box-anchor's top-left centred over the board,
 * STAGE_DROP below its top; MINI — its rolled scroll centred on the hero
 * header's [data-quest-slot] at QUEST_MINI_SCALE. Switching `mini` then
 * just picks the other precomputed transform in the same render, so the
 * flight starts on its first frame (no measuring in between). Re-measures
 * whenever the anchor, the board, the slot or the page column resizes;
 * rects are compared to the column the wrapper is positioned in, so page
 * scroll cancels out. The first placement is instant; later changes glide
 * (CSS transition).
 *
 * plateRise = how far the QUEST plate rides above the box top — the rolled
 * scroll's visible extent runs from there to the box bottom, so that span
 * is what centres on the slot.
 */
export function useQuestFloatPlacement(
  active: boolean,
  mini: boolean,
  wrapperRef: RefObject<HTMLDivElement | null>,
  plateRise: number,
): CSSProperties | undefined {
  type Spot = { x: number; y: number };
  const [spots, setSpots] = useState<{ stage: Spot; mini: Spot | null } | null>(null);
  const [ready, setReady] = useState(false);

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
    const ah = anchor.offsetHeight;
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
      // centre the plate-to-bottom span (top = -plateRise) on the slot
      miniSpot = toWrapper(
        r.left + r.width / 2 - (aw * s) / 2,
        r.top + r.height / 2 - (s * (ah - plateRise)) / 2,
        s,
      );
    }
    setSpots({ stage, mini: miniSpot });
  }, [wrapperRef, plateRise]);

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

  // Transitions only after the first placement lands (no flight on load).
  useLayoutEffect(() => {
    if (!active || !spots || ready) return;
    const id = window.setTimeout(() => setReady(true), 50);
    return () => window.clearTimeout(id);
  }, [active, spots, ready]);

  if (!active) return undefined;
  const spot = spots && (mini ? spots.mini : spots.stage);
  if (!spot) return { visibility: 'hidden' };
  return {
    transform: `translate(${spot.x}px, ${spot.y}px) scale(${mini ? QUEST_MINI_SCALE : 1})`,
    ...(ready ? {} : { transition: 'none' }),
  };
}
