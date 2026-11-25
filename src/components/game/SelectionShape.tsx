import React from 'react';
import { slotBoundaries } from '../../hooks/useElementWidth';
import cornerArt from '../../assets/icons/selection-corner.png';
import { ARCH_BAND_ART, ARCH_H, ARCH_LIFT, ARCH_RISE_ART, archOutline } from './cutawayStone';

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

/*
 * UNDER AN ARCH (the `?wall=1` experiment, cutawayStone.ts; user 2026-11-21:
 * "Could the top of the selection border follow the curvature of the new
 * arch?"). There each card stands in an arched cutout that begins 8px ABOVE
 * the strip, and the card half's top is not a straight row with two corner
 * pieces: the line climbs the column, rounds the arch's shoulder, crosses
 * under the band and comes down the other side, on the very pixels the
 * arcade paints as the cutout's rim (archOutline: one description for
 * both). The wash is clipped to the same edge. No corner art up there: an
 * arch has no corner. The sides, the foot, the elbows and the drawer half
 * are as ever.
 */
const ARCH_ROWS = ARCH_BAND_ART + ARCH_RISE_ART;

/*
 * THE CORNER PIECE UNDER AN ARCH (user, 2026-11-21: "im wondering if the
 * corner piece I made could still work in those top corner, or if it could
 * be altered slightly to fit?"). It is a square corner: two arms at a right
 * angle with the jewel where they meet. The arch's shoulder is a slow curve
 * (up to 24 art px wide for 8 of rise) with no right angle on it, so on the
 * curve an arm would stand clear of the line. The one place it sits as
 * painted is where the arch SPRINGS from the column: the jewel on the
 * line's pixel there, one arm down the card's side, the other INTO the
 * opening, exactly as the piece sits on a square top corner, only lower
 * (my first try turned the second arm out over the column's capital; the
 * user: "those top corner pieces are facing outward instead of inward").
 * That spot does not move with the card's width. (It has since been raised
 * a little way up the curve: SPRING_RAISE_ART.)
 */
/**
 * How many art rows above the side's first row the jewel sits. The user
 * placed it by eye, from the filmed picture: at the springing first, then
 * "raise the corner pieces 2 art pixels", then "maybe 2 more!". STRAIGHT UP
 * ONLY: four rows up the arch has begun to lean in by one or two art px,
 * and I started to move the piece sideways with it to keep the jewel on the
 * line; the user: "just move it vertically for now, not to the side". So
 * the piece keeps the column it has on a square corner, and the line passes
 * just inside it up there.
 */
const SPRING_RAISE_ART = 4;

/** The arch part of the line, the wash's clip and the two corner pieces, for a card `w` CSS px wide. */
function archShape(w: number, first: boolean, last: boolean, closed: boolean): { rects: Rect[]; clip: string; pieces: Piece[] } {
  const runs = archOutline(Math.floor(w / A), first, last);
  const rects: Rect[] = runs.map(run => ({ left: run.x * A, width: run.w * A, top: run.y * A - ARCH_LIFT, height: A }));
  // The corner pieces: turned as for a square top-left and top-right corner
  // (OUTER.tl / OUTER.tr) and in their columns, with the jewel's row
  // SPRING_RAISE_ART above the side's first row.
  const top = (ARCH_ROWS - SPRING_RAISE_ART) * A - ARCH_LIFT - A;
  const pieces: Piece[] = [
    { key: 'spring-l', style: { left: -A, top, transform: 'scale(-1, -1)' } },
    { key: 'spring-r', style: { right: -A, top, transform: 'scaleY(-1)' } },
  ];
  // The wash: inside the line's outer edge, row by row (y from the band's row, in the wash's own box).
  const leftAt: number[] = [];
  const rightAt: number[] = [];
  for (let y = 0; y < ARCH_ROWS; y++) {
    const onRow = runs.filter(run => run.y === y);
    leftAt.push(Math.min(...onRow.map(run => run.x)) * A);
    rightAt.push(Math.max(...onRow.map(run => run.x + run.w)) * A);
  }
  const c = `${A}px`;
  const pts: string[] = [`0 ${ARCH_ROWS * A}px`];
  for (let y = ARCH_ROWS - 1; y >= 0; y--) pts.push(`${leftAt[y]}px ${(y + 1) * A}px`, `${leftAt[y]}px ${y * A}px`);
  for (let y = 0; y < ARCH_ROWS; y++) pts.push(`${rightAt[y]}px ${y * A}px`, `${rightAt[y]}px ${(y + 1) * A}px`);
  pts.push(`100% ${ARCH_ROWS * A}px`);
  pts.push(...(closed ? [`100% calc(100% - ${c})`, `calc(100% - ${c}) calc(100% - ${c})`, `calc(100% - ${c}) 100%`] : ['100% 100%']));
  pts.push(...(closed ? [`${c} 100%`, `${c} calc(100% - ${c})`, `0 calc(100% - ${c})`] : ['0 100%']));
  return { rects, clip: `polygon(${pts.join(', ')})`, pieces };
}

/*
 * CORNER ART (user TEST, 2026-10-03 — may be reverted: delete this block,
 * the <Corners> calls and src/assets/icons/selection-corner.png). The user's
 * 6×6 piece, painted as a BOTTOM-RIGHT corner: its dark-red pixel (art 4,4)
 * lands on the outer corner pixel the line leaves cut, its brown arms run
 * along the line, and its black rim reaches one art px outside the shape.
 * Mirrored for the other corners. On both tones for now (the user wants to
 * see the brown piece on the enemy's blood line too).
 *
 * INSIDE CORNERS (the elbows, where a card side meets the drawer's top edge)
 * get the piece too: there the line touches only diagonally, and the pixel
 * it skips is the drawer's first row directly under the card's side column.
 * The piece as painted (arms up and left) fits the LEFT elbow; the right one
 * is mirrored. It straddles the seam — art rows 0-3 above it, 4-5 below —
 * and the drawer clips everything above its top (that hides its open
 * slide), so each elbow is drawn in two clipped halves: the top four rows
 * with the card half, the bottom two with the drawer half. Both halves are
 * on the one opacity clock, so they read as one piece.
 */
const CORNER_ART_TONES: SelectionTone[] = ['copper', 'blood'];
const CORNER_PX = 6 * A;
const FLIP_X = 'scaleX(-1)';

type Piece = { key: string; style: React.CSSProperties };

/** The outer corners of a layer box; right-hand pieces anchor to its right edge. */
const OUTER: Record<'tl' | 'tr' | 'br' | 'bl', Piece> = {
  br: { key: 'br', style: { right: -A, bottom: -A } },
  bl: { key: 'bl', style: { left: -A, bottom: -A, transform: FLIP_X } },
  tr: { key: 'tr', style: { right: -A, top: -A, transform: 'scaleY(-1)' } },
  tl: { key: 'tl', style: { left: -A, top: -A, transform: 'scale(-1, -1)' } },
};

/** Elbow tops (art rows 0-3), in the card half's box: they end at its bottom. */
const ELBOW_TOP_CLIP = `inset(0 0 ${2 * A}px 0)`;
const elbowTopLeft: Piece = { key: 'el-top', style: { left: -4 * A, bottom: -2 * A, clipPath: ELBOW_TOP_CLIP } };
const elbowTopRight: Piece = { key: 'er-top', style: { right: -4 * A, bottom: -2 * A, clipPath: ELBOW_TOP_CLIP, transform: FLIP_X } };

/** Elbow bottoms (art rows 4-5), in the drawer half's box, for a card on [x0, x1). */
const ELBOW_BOTTOM_CLIP = `inset(${4 * A}px 0 0 0)`;
const elbowBottomLeft = (x0: number): Piece => ({ key: 'el-bot', style: { left: x0 - 4 * A, top: -4 * A, clipPath: ELBOW_BOTTOM_CLIP } });
const elbowBottomRight = (x1: number): Piece => ({ key: 'er-bot', style: { left: x1 - 2 * A, top: -4 * A, clipPath: ELBOW_BOTTOM_CLIP, transform: FLIP_X } });

const Corners: React.FC<{ pieces: Piece[]; tone: SelectionTone }> = ({ pieces, tone }) =>
  CORNER_ART_TONES.includes(tone) ? (
    <>
      {pieces.map(p => (
        <img
          key={p.key}
          src={cornerArt}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute max-w-none"
          style={{ ...p.style, width: CORNER_PX, height: CORNER_PX, imageRendering: 'pixelated' }}
        />
      ))}
    </>
  ) : null;

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
  /** The cards stand under arches (the wall): the top of the shape follows its card's arch. */
  arch?: boolean;
}

/**
 * The card half: one layer per slot, laid UNDER the card row (render it
 * first in the strip's relative wrapper), faded in for the selected slot
 * only. Open at the bottom, where it continues into the drawer — unless its
 * entity opens none.
 */
export const SelectionStrip: React.FC<StripProps> = ({ ids, selectedIndex, width, tone, opensDrawer, arch = false }) => {
  const slotCount = ids.length;
  if (slotCount <= 0 || width <= 0) return null;
  const b = shapeEdges(width, slotCount);
  return (
    <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width }}>
      {ids.map((id, j) => {
        const w = b[j + 1] - b[j];
        const closed = !opensDrawer(id);
        const arched = arch ? archShape(w, j === 0, j === slotCount - 1, closed) : null;
        // Where the straight sides begin: under the top row, or where the arch springs.
        const sideTop = arched ? ARCH_H - ARCH_LIFT : A;
        const rects: Rect[] = [
          // the top: a row, or the arch
          ...(arched ? arched.rects : [{ left: A, width: w - 2 * A, top: 0, height: A }]),
          // side columns, down to the seam (or to the closing row)
          { left: 0, width: A, top: sideTop, bottom: closed ? A : 0 },
          { left: w - A, width: A, top: sideTop, bottom: closed ? A : 0 },
        ];
        if (closed) rects.push({ left: A, width: w - 2 * A, bottom: 0, height: A });
        return (
          <div
            key={id}
            className="absolute inset-y-0 transition-opacity duration-300 ease-out"
            style={{ left: b[j], width: w, opacity: j === selectedIndex ? 1 : 0 }}
          >
            {arched
              ? <div className="absolute inset-x-0 bottom-0" style={{ top: -ARCH_LIFT, background: TONES[tone].fill, clipPath: arched.clip }} />
              : <div className="absolute inset-0" style={{ background: TONES[tone].fill, clipPath: clipCorners(true, true, closed, closed) }} />}
            <Line rects={rects} tone={tone} />
            <Corners
              pieces={closed
                ? [...(arched ? arched.pieces : [OUTER.tl, OUTER.tr]), OUTER.br, OUTER.bl]
                : [
                    ...(arched ? arched.pieces : [OUTER.tl, OUTER.tr]),
                    // the elbows' top halves, where the drawer reaches past the card
                    ...(b[j] > 0 ? [elbowTopLeft] : []),
                    ...(b[j + 1] < b[slotCount] ? [elbowTopRight] : []),
                  ]}
              tone={tone}
            />
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
  /**
   * The wall (`?wall=1`, cutawayStone.ts): the open drawer is a CELLAR looked
   * into, and its back is earth (index.css .wall-cellar), under the wash.
   * One layer for the whole drawer, not one per slot: it must not dip while
   * two slots' washes crossfade.
   */
  cellar?: boolean;
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
export const SelectionDrawer: React.FC<DrawerProps> = ({ ids, index, width, tone, cellar = false }) => {
  const slotCount = ids.length;
  if (slotCount <= 0 || width <= 0 || index < 0 || index >= slotCount) return null;
  const b = shapeEdges(width, slotCount);
  const W = b[slotCount];
  return (
    <div aria-hidden className="absolute top-0 bottom-0 left-0 pointer-events-none" style={{ width: W, zIndex: -1 }}>
      {cellar && <div className="absolute inset-0 wall-cellar" style={{ clipPath: clipCorners(false, false, true, true) }} />}
      {ids.map((id, j) => (
        <div
          key={id}
          className="absolute inset-0 transition-opacity duration-300 ease-out"
          style={{ opacity: j === index ? 1 : 0 }}
        >
          <div className="absolute inset-0" style={{ background: TONES[tone].fill, clipPath: clipCorners(b[j] > 0, b[j + 1] < W, true, true) }} />
          <Line rects={drawerRects(W, b[j], b[j + 1])} tone={tone} />
          <Corners
            pieces={[
              OUTER.bl, OUTER.br,
              // where the drawer reaches past the card: its own top corner,
              // and the bottom half of the elbow
              ...(b[j] > 0 ? [OUTER.tl, elbowBottomLeft(b[j])] : []),
              ...(b[j + 1] < W ? [OUTER.tr, elbowBottomRight(b[j + 1])] : []),
            ]}
            tone={tone}
          />
        </div>
      ))}
    </div>
  );
};
