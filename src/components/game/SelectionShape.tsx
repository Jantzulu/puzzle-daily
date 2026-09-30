import React from 'react';
import { slotBoundaries } from '../../hooks/useElementWidth';
import { SELECTION_FINISH, SELECTION_SHAPED, type SelectionFinish } from './selectionFinish';

/**
 * THE SELECTION AS ONE SHAPE (2026-09-30) — candidate finishes behind a
 * TEMPORARY on-device switch (the `?directions=` precedent: flip with a
 * reload, judge on a real phone, then delete the losers).
 *
 *   (no flag)            'flat'     the shipped look: the selected card and the
 *                                   drawer each carry the same flat wash
 *   ?selection=outline   'outline'  one silhouette — card and drawer as ONE
 *                                   shape — traced by a 1-art-px accent line
 *   ?selection=soft      'soft'     the same silhouette with a stepped inner
 *                                   glow: three 1-art-px bands of falling
 *                                   brightness (pixel steps, never blur)
 *
 * The user's problem with 'flat' (2026-09-30): the wash "works, but is sharp
 * on the edges", and softer glows "never met correctly". The diagnosis: the
 * wash is two rectangles that happen to share a colour, so every edge is
 * left over, and the old glows were two separate lights on two clocks. Here
 * the silhouette is ONE shape — a rectangle for a lone card, an L at either
 * end of the strip, an upside-down T in the middle — and every band is cut
 * from the same geometry, so the card half and the drawer half cannot
 * disagree.
 *
 * GEOMETRY. Everything sits on the 2px art grid anchored at the strip's left
 * edge (slotBoundaries is even-snapped; the right edge drops a stray odd
 * pixel). Band k is the set of art pixels at Manhattan distance k+1 from
 * outside the shape, with the outer corner pixel removed (the user's clipped
 * corners). That rule gives: band 0 clipped at every outer corner and
 * touching only diagonally at the two inside corners (the elbows), inner
 * bands square at outer corners and stepping diagonally round the elbows.
 * Rectangles only — no rect overlaps another, so no pixel is ever painted
 * twice at double strength.
 *
 * ONE CLOCK. Both halves are drawn once PER SLOT and crossfade by opacity
 * together (300ms, the card wash's old timing), so on a switch the whole old
 * silhouette fades out while the whole new one fades in — neither half can
 * run ahead of the other. Layers are keyed by ENTITY id, so when the strip
 * re-divides mid-run (a summon arrives, a type leaves) the selected shape
 * moves with its card instead of fading across to a neighbour. The drawer
 * half needs no height: its rects anchor to the drawer's bottom.
 *
 * In shaped modes the cards themselves sit on the same art-grid edges
 * (shapedSlotStyle), so a neighbour's hover wash or flush count badge cannot
 * cross into the selected silhouette's side band.
 *
 * A placeholder for painted art: a Panel Forge kit (corners, edges, the two
 * elbows, fill) can later draw the same silhouette.
 */
export type SelectionTone = 'copper' | 'blood';

const A = 2; // one art pixel in CSS px

// Fill = the flat wash the cards and drawers wear today (copper-900/15,
// blood-900/15). Line colours are the accents of each side's identity.
const TONES: Record<SelectionTone, { fill: string; line: string }> = {
  copper: { fill: 'rgba(94, 61, 41, 0.15)', line: '196, 145, 92' },   // copper-500
  blood: { fill: 'rgba(107, 16, 16, 0.15)', line: '220, 67, 67' },    // blood-500
};

const BAND_ALPHAS: Record<Exclude<SelectionFinish, 'flat'>, number[]> = {
  outline: [0.55],
  soft: [0.32, 0.16, 0.07],
};

const alphasFor = () => BAND_ALPHAS[SELECTION_FINISH as Exclude<SelectionFinish, 'flat'>];

type Rect = { left: number; width: number; top?: number; bottom?: number; height?: number };

/** Band-k row start inset from an outer corner (the corner pixel is cut from band 0 only). */
const rowInset = (k: number) => Math.max(k, 1) * A;
/** Band-k column start inset: one row below its own band's corner pixel, which the row owns. */
const colInset = (k: number) => (k + 1) * A;

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

const Bands: React.FC<{ rects: Rect[][]; tone: SelectionTone; alphas: number[] }> = ({ rects, tone, alphas }) => (
  <>
    {rects.map((band, k) => band.map((r, n) => (
      <span
        key={`${k}-${n}`}
        className="absolute"
        style={{ ...r, background: `rgba(${TONES[tone].line}, ${alphas[k]})` }}
      />
    )))}
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
   * True while a drawer is (or is about to be) open under the strip: the
   * selected entity has one, OR the drawer is still showing while it closes.
   * False = the card closes at the bottom (a hero with nothing to show).
   */
  hasDrawer: boolean;
}

/**
 * The card half: one layer per slot, laid UNDER the card row, faded in for
 * the selected slot only. Open at the bottom, where it continues into the
 * drawer — unless no drawer is open.
 */
export const SelectionStrip: React.FC<StripProps> = ({ ids, selectedIndex, width, tone, hasDrawer }) => {
  const slotCount = ids.length;
  if (!SELECTION_SHAPED || slotCount <= 0 || width <= 0) return null;
  const alphas = alphasFor();
  const b = shapeEdges(width, slotCount);
  const closed = !hasDrawer;
  return (
    <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width }}>
      {ids.map((id, j) => {
        const w = b[j + 1] - b[j];
        const rects = alphas.map((_, k) => {
          const band: Rect[] = [
            // top row
            { left: rowInset(k), width: w - 2 * rowInset(k), top: k * A, height: A },
            // side columns, down to the seam (or to the closing row)
            { left: k * A, width: A, top: colInset(k), bottom: closed ? colInset(k) : 0 },
            { left: w - (k + 1) * A, width: A, top: colInset(k), bottom: closed ? colInset(k) : 0 },
          ];
          if (closed) band.push({ left: rowInset(k), width: w - 2 * rowInset(k), bottom: k * A, height: A });
          return band;
        });
        return (
          <div
            key={id}
            className="absolute inset-y-0 transition-opacity duration-300 ease-out"
            style={{ left: b[j], width: w, opacity: j === selectedIndex ? 1 : 0 }}
          >
            <div className="absolute inset-0" style={{ background: TONES[tone].fill, clipPath: clipCorners(true, true, closed, closed) }} />
            <Bands rects={rects} tone={tone} alphas={alphas} />
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

/** The drawer half's rects for the slot [x0, x1) of a shape W wide. */
function drawerRects(alphas: number[], W: number, x0: number, x1: number): Rect[][] {
  // A drawer corner exists only where the drawer reaches past the card.
  const leftOpen = x0 > 0;
  const rightOpen = x1 < W;
  return alphas.map((_, k) => {
    const band: Rect[] = [
      // side columns: from the seam when the card's side continues straight
      // down, else from below the drawer's own top corner
      { left: k * A, width: A, top: leftOpen ? colInset(k) : 0, bottom: colInset(k) },
      { left: W - (k + 1) * A, width: A, top: rightOpen ? colInset(k) : 0, bottom: colInset(k) },
      // bottom row
      { left: rowInset(k), width: W - 2 * rowInset(k), bottom: k * A, height: A },
    ];
    if (leftOpen) {
      // the drawer's top edge left of the card, up to the elbow
      band.push({ left: rowInset(k), width: x0 - rowInset(k), top: k * A, height: A });
      // round the elbow: pixels (x0 + u, w) with u + w = k - 1
      for (let u = 0; u < k; u++) band.push({ left: x0 + u * A, width: A, top: (k - 1 - u) * A, height: A });
    }
    if (rightOpen) {
      band.push({ left: x1, width: W - rowInset(k) - x1, top: k * A, height: A });
      for (let u = 0; u < k; u++) band.push({ left: x1 - (u + 1) * A, width: A, top: (k - 1 - u) * A, height: A });
    }
    return band;
  });
}

/**
 * The drawer half: laid inside the drawer (which must be position: relative
 * and a stacking context — .hero-drawer is both) at z-index -1, so it paints
 * over the drawer's own box but under its text. One layer per slot on the
 * card half's opacity clock (see ONE CLOCK above).
 */
export const SelectionDrawer: React.FC<DrawerProps> = ({ ids, index, width, tone }) => {
  const slotCount = ids.length;
  if (!SELECTION_SHAPED || slotCount <= 0 || width <= 0 || index < 0 || index >= slotCount) return null;
  const alphas = alphasFor();
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
          <Bands rects={drawerRects(alphas, W, b[j], b[j + 1])} tone={tone} alphas={alphas} />
        </div>
      ))}
    </div>
  );
};
