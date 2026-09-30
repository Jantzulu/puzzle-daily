import type { CSSProperties } from 'react';
import { slotBoundaries } from '../../hooks/useElementWidth';

/**
 * The TEMPORARY `?selection=` switch and the few layout knobs it turns in
 * the panels. Kept apart from SelectionShape.tsx so that file exports only
 * components (fast refresh). See the design record at the top of
 * SelectionShape.tsx; delete this module with the switch once a finish wins.
 */
export type SelectionFinish = 'flat' | 'outline' | 'soft';

function readSelectionFinish(): SelectionFinish {
  try {
    const raw = new URLSearchParams(window.location.search).get('selection');
    return raw === 'outline' || raw === 'soft' ? raw : 'flat';
  } catch {
    return 'flat'; // no window (tests) or malformed URL — the shipped look wins
  }
}

export const SELECTION_FINISH: SelectionFinish = readSelectionFinish();
/** True when the shape overlays draw the wash — cards and drawers drop their own bg. */
export const SELECTION_SHAPED = SELECTION_FINISH !== 'flat';

/**
 * The drawer's slide-in easing. Flat keeps its spring; shaped modes use an
 * ease-out that never overshoots, because the spring carried the drawer
 * (and its half of the silhouette) ~0.8px below the seam mid-open, splitting
 * the shape's side lines for a moment.
 */
export const DRAWER_SLIDE_EASE = SELECTION_SHAPED
  ? 'cubic-bezier(0.22, 1, 0.36, 1)'
  : 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/**
 * Shaped modes only: a card slot's box on the art-grid slot edges (the
 * slots are otherwise fractional flex-1 boxes that can reach up to a pixel
 * into the selected silhouette). flex-shrink absorbs the sub-pixel gap
 * between the measured and the real strip width. Undefined = plain flex-1.
 */
export function shapedSlotStyle(width: number, slotCount: number, i: number): CSSProperties | undefined {
  if (!SELECTION_SHAPED || width <= 0 || slotCount <= 0) return undefined;
  const b = slotBoundaries(width, slotCount);
  return { flex: '0 1 auto', width: b[i + 1] - b[i] };
}
