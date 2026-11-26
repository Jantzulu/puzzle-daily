import React from 'react';

// ============================================================================
// PIXEL ICONS — the small marks of the page, on the art grid, in the user's hand
// ============================================================================
// A measured review of the Play page (2026-11-25) found the most visible
// break from the user's painted style was not in the stone but in the small
// web-style pieces riding on it: the (?) marks, the clear button's trash
// can and the cards' facing arrows were thin vector line icons, smooth
// where everything round them is pixels (user: "lets start with the text
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
  help: [
    '...KKKKK...',
    '.KKXXXXXKK.',
    '.KXXDDDXXK.',
    'KXXDXXXDXXK',
    'KXDDDDXDDXK',
    'KXDDDXDDDXK',
    'KXDDDDDDDXK',
    'KXXDDXDDXXK',
    '.KXXDDDXXK.',
    '.KKXXXXXKK.',
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
  // The facing arrows are glyphs in a line of text, as letters are: no outline.
  // East, and north-east; the other six are these turned by quarter turns.
  // (The head's arms are three pixels long: at two, turned to point up, it read as a dagger.)
  arrow: [
    '...X...',
    '....X..',
    '.....X.',
    'XXXXXXX',
    '.....X.',
    '....X..',
    '...X...',
  ],
  arrowDiag: [
    '...XXXX',
    '.....XX',
    '....X.X',
    '...X..X',
    '..X....',
    '.X.....',
    'X......',
  ],
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
  /** Quarter turns clockwise (the arrows). */
  turns?: number;
}> = ({ icon, className = '', turns = 0 }) => {
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
      style={turns ? { transform: `rotate(${turns * 90}deg)` } : undefined}
    >
      {runs(rows).map(r => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={COLOR[r.c]} />
      ))}
    </svg>
  );
};
