import React from 'react';

// ============================================================================
// PIXEL ICONS — the small marks of the page, on the art grid, in the user's hand
// ============================================================================
// A measured review of the Play page (2026-11-25) found the most visible
// break from the user's painted style was not in the stone but in the small
// web-style pieces riding on it: the (?) marks and the clear button's trash
// can (and the cards' facing arrows: see below) were thin vector line icons,
// smooth where everything round them is pixels (user: "lets start with the text
// floor and the pixel icons").
//
// So each is a tiny bitmap, written out as rows of characters and drawn as
// crisp-edged rects, one art px = 2 CSS px like every skin (panelSkins Z):
//   K  the black line (the user's outline: one art px, corners cut)
//   X  the icon's own colour: the CSS `color` of where it is mounted, so a
//      (?) still wears its section's colour and a hover still recolours it
//   D  the dark fill inside a framed piece (the tap hint's fill)
//   .  nothing
// PLACEHOLDER ART, like the wall's: when the user paints their own, each
// bitmap is replaced by a PNG and nothing else changes.

const INK = '#000000';
const DARK = '#15100b';

const ICONS = {
  // A framed piece in their manner: black, one line of its colour, the fill, the glyph.
  // NO FILLED CORNERS in the black line (the user, of this mark as first
  // drawn: "I do not tend to outline full corners, meaning I would remove
  // the extra black pixel in the 4 diagonal corners"): where their outline
  // turns, its two runs meet only at a diagonal. Every bitmap here keeps to it.
  // THE COLOURED RING INSIDE IT THE SAME (the user, next: "maybe even the
  // internal circles could use without the zig zagging colored pixels, and
  // instead be stylized like the plates themselves and my other art
  // (generally only diagonal). I think this is contributing to the (?)
  // looking very fat"): one pixel thick all the way round, never doubled
  // at a turn.
  help: [
    '...KKKKK...',
    '..KXXXXXK..',
    '.KXDDDDDXK.',
    'KXDDXXXDDXK',
    'KXDDDDXDDXK',
    'KXDDDXDDDXK',
    'KXDDDDDDDXK',
    'KXDDDXDDDXK',
    '.KXDDDDDXK.',
    '..KXXXXXK..',
    '...KKKKK...',
  ],
  // A lidded bin, outlined, its slats the black line again.
  trash: [
    '...KKK...',
    '.KKXXXKK.',
    'KXXXXXXXK',
    'KKKKKKKKK',
    '.KXKXKXK.',
    '.KXKXKXK.',
    '.KXKXKXK.',
    '.KXKXKXK.',
    '.KXXXXXK.',
    '..KKKKK..',
  ],
  // (THE FACING ARROWS were pixel glyphs here too for a day, 7x7. The user:
  // "the directional arrows are now too big as pixel art, can we revert them
  // back?" A pixel on this grid is 2 CSS px, so an arrow that reads at all is
  // 14px in a 13px line of text. They are the thin line arrows again:
  // game/DirectionArrow.tsx. Not to be repeated at this size.)
} as const;

export type PixelIconName = keyof typeof ICONS;

/** One art px in CSS px: the skins' Z (panelSkins), spelled here so this file stands alone. */
const Z = 2;

const COLOR: Record<string, string> = { K: INK, X: 'currentColor', D: DARK };

/** The rows as horizontal runs of one colour (fewer rects than one per pixel). */
function runs(rows: readonly string[]): { x: number; y: number; w: number; c: string }[] {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === c) w++;
      if (c !== '.') out.push({ x, y, w, c });
      x += w;
    }
  });
  return out;
}

export const PixelIcon: React.FC<{
  icon: PixelIconName;
  className?: string;
}> = ({ icon, className = '' }) => {
  const rows = ICONS[icon];
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg
      aria-hidden="true"
      className={`flex-shrink-0 ${className}`}
      width={w * Z}
      height={h * Z}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
    >
      {runs(rows).map(r => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={COLOR[r.c]} />
      ))}
    </svg>
  );
};
