import React from 'react';
import { slotBoundaries } from '../../hooks/useElementWidth';

/**
 * THE SELECTION AS ONE OUTLINED SHAPE — the selected card and its drawer
 * drawn as ONE silhouette with a 1-art-px accent line: a rectangle for a lone
 * card, an L at either end of the strip, an upside-down T in the middle.
 *
 * DESIGN RECORD.
 *  - 2026-07-16: the selected card and the drawer each carried the same flat
 *    wash; four attempts at softer glows (sliding rect, soft sides, bloom
 *    pair, seam-straddling gradient) each traded one artifact for another.
 *  - 2026-09-30: the user — the wash "works, but is sharp on the edges", the
 *    glows "never met correctly". Diagnosis: two rectangles that happen to
 *    share a colour (every edge left over) and two lights on two clocks.
 *    This one-shape version shipped behind `?selection=outline|soft`; after
 *    testing both on their phone the user chose OUTLINE ("They look and feel
 *    great! I think I prefer the 'outline' over the soft") and retired the
 *    caret with it — the open seam already says "this card owns this
 *    drawer". The flat wash, the stepped-glow finish and the caret are gone.
 *  - Do not reintroduce a moving highlight rectangle: the shape crossfades
 *    per slot, it never slides.
 *  - Agreed follow-up: a Panel Forge kit (corners, edges, fill and the two
 *    inside-corner ELBOWS) so the user can paint this edge.
 *
 * GEOMETRY. Everything sits on the 2px art grid anchored at the strip's left
 * edge (slotBoundaries is even-snapped; the right edge drops a stray odd
 * pixel). The line is the ring of art pixels just inside the silhouette,
 * with each OUTER corner pixel cut (the user's clipped corners); at the two
 * inside corners (the elbows, where a card side meets the drawer's top edge)
 * the line touches only diagonally. Rows own their corner pixels and columns
 * start one art px lower, so no pixel is painted twice. The fill is the old
 * wash, clipped to the same corners.
 *
 * ONE CLOCK. Both halves are drawn once PER SLOT and crossfade by opacity
 * together (300ms), so on a switch the whole old silhouette fades out while
 * the whole new one fades in. Layers are keyed by ENTITY id, so when the
 * strip re-divides mid-run (a summon arrives, a type leaves) the shape moves
 * with its card instead of fading across to a neighbour. The drawer half
 * needs no height: its rects anchor to the drawer's bottom.
 *
 * The cards themselves sit on the same art-grid edges (artGridSlotStyle), so
 * a neighbour's hover wash or flush count badge cannot cross into the line.
 */
export type SelectionTone = 'copper' | 'blood';

const A = 2; // one art pixel in CSS px

// Fill = the wash the cards and drawers used to wear (copper-900/15,
// blood-900/15). The line is each side's identity accent (copper-500,
// blood-500) at 55%.
const TONES: Record<SelectionTone, { fill: string; line: string }> = {
  copper: { fill: 'rgba(94, 61, 41, 0.15)', line: 'rgba(196, 145, 92, 0.55)' },
  blood: { fill: 'rgba(107, 16, 16, 0.15)', line: 'rgba(220, 67, 67, 0.55)' },
};

type Rect = { left: number; width: number; top?: number; bottom?: number; height?: number };

/** The shape's slot edges on the art grid, and its right edge (W less any odd pixel). */
function shapeEdges(width: number, slotCount: number): number[] {
  const right = width - (width % A);
  const b = slotBoundaries(width, slotCount);
  b[slotCount] = right;
  return b;
}

const clipCorners = (tl: boolean, tr: boolean, br: boolean, bl: boolean) => {
  const c = `${A}px`;
  const pts = [
    ...(tl ? [`${c} 0`] : ['0 0']),
    ...(tr ? [`calc(100% - ${c}) 0`, `calc(100% - ${c}) ${c}`, `100% ${c}`] : ['100% 0']),
    ...(br ? [`100% calc(100% - ${c})`, `calc(100% - ${c}) calc(100% - ${c})`, `calc(100% - ${c}) 100%`] : ['100% 100%']),
    ...(bl ? [`${c} 100%`, `${c} calc(100% - ${c})`, `0 calc(100% - ${c})`] : ['0 100%']),
    ...(tl ? [`0 ${c}`, `${c} ${c}`] : []),
  ];
  return `polygon(${pts.join(', ')})`;
};

const Line: React.FC<{ rects: Rect[]; tone: SelectionTone }> = ({ rects, tone }) => (
  <>
    {rects.map((r, n) => (
      <span key={n} className="absolute" style={{ ...r, background: TONES[tone].line }} />
    ))}
  </>
);

interface StripProps {
  /** The strip's entity ids, in slot order (layers are keyed by them). */
  ids: string[];
  selectedIndex: number;
  /** The strip's measured width (useElementWidth), 0 = not measured. */
  width: number;
  tone: SelectionTone;
  /**
   * Whether this entity opens a drawer at all. False = its card half closes
   * at the bottom (a hero with nothing to show). Asked PER LAYER, so a card
   * fading out keeps its own shape whatever the new selection is.
   */
  opensDrawer: (id: string) => boolean;
}

/**
 * The card half: one layer per slot, laid UNDER the card row (render it
 * first in the strip's relative wrapper), faded in for the selected slot
 * only. Open at the bottom, where it continues into the drawer — unless its
 * entity opens none.
 */
export const SelectionStrip: React.FC<StripProps> = ({ ids, selectedIndex, width, tone, opensDrawer }) => {
  const slotCount = ids.length;
  if (slotCount <= 0 || width <= 0) return null;
  const b = shapeEdges(width, slotCount);
  return (
    <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width }}>
      {ids.map((id, j) => {
        const w = b[j + 1] - b[j];
        const closed = !opensDrawer(id);
        const rects: Rect[] = [
          // top row
          { left: A, width: w - 2 * A, top: 0, height: A },
          // side columns, down to the seam (or to the closing row)
          { left: 0, width: A, top: A, bottom: closed ? A : 0 },
          { left: w - A, width: A, top: A, bottom: closed ? A : 0 },
        ];
        if (closed) rects.push({ left: A, width: w - 2 * A, bottom: 0, height: A });
        return (
          <div
            key={id}
            className="absolute inset-y-0 transition-opacity duration-300 ease-out"
            style={{ left: b[j], width: w, opacity: j === selectedIndex ? 1 : 0 }}
          >
            <div className="absolute inset-0" style={{ background: TONES[tone].fill, clipPath: clipCorners(true, true, closed, closed) }} />
            <Line rects={rects} tone={tone} />
          </div>
        );
      })}
    </div>
  );
};

interface DrawerProps {
  /** The strip's entity ids, in slot order — the same list SelectionStrip gets. */
  ids: string[];
  /** The slot whose drawer this is (the RENDERED entity: it survives the close animation). */
  index: number;
  width: number;
  tone: SelectionTone;
}

/** The drawer half's line for the slot [x0, x1) of a shape W wide. */
function drawerRects(W: number, x0: number, x1: number): Rect[] {
  // A drawer corner exists only where the drawer reaches past the card.
  const leftOpen = x0 > 0;
  const rightOpen = x1 < W;
  const rects: Rect[] = [
    // side columns: from the seam when the card's side continues straight
    // down, else from below the drawer's own top corner
    { left: 0, width: A, top: leftOpen ? A : 0, bottom: A },
    { left: W - A, width: A, top: rightOpen ? A : 0, bottom: A },
    // bottom row
    { left: A, width: W - 2 * A, bottom: 0, height: A },
  ];
  // the drawer's top edge either side of the card, up to the elbows
  if (leftOpen) rects.push({ left: A, width: x0 - A, top: 0, height: A });
  if (rightOpen) rects.push({ left: x1, width: W - A - x1, top: 0, height: A });
  return rects;
}

/**
 * The drawer half: laid inside the drawer (which must be position: relative
 * and a stacking context — .hero-drawer is both, via its inline transform)
 * at z-index -1, so it paints over the drawer's own box but under its text.
 * One layer per slot on the card half's opacity clock (see ONE CLOCK above).
 */
export const SelectionDrawer: React.FC<DrawerProps> = ({ ids, index, width, tone }) => {
  const slotCount = ids.length;
  if (slotCount <= 0 || width <= 0 || index < 0 || index >= slotCount) return null;
  const b = shapeEdges(width, slotCount);
  const W = b[slotCount];
  return (
    <div aria-hidden className="absolute top-0 bottom-0 left-0 pointer-events-none" style={{ width: W, zIndex: -1 }}>
      {ids.map((id, j) => (
        <div
          key={id}
          className="absolute inset-0 transition-opacity duration-300 ease-out"
          style={{ opacity: j === index ? 1 : 0 }}
        >
          <div className="absolute inset-0" style={{ background: TONES[tone].fill, clipPath: clipCorners(b[j] > 0, b[j + 1] < W, true, true) }} />
          <Line rects={drawerRects(W, b[j], b[j + 1])} tone={tone} />
        </div>
      ))}
    </div>
  );
};
