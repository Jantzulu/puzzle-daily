import React from 'react';

// ============================================================================
// STONE LINTEL MESH — the navbar's stone
// ============================================================================
// One hewn beam spanning the top of the screen, built with the compendium
// slab's recipe: an irregular silhouette, a NARROW ring of bevel facets lit
// from the top-left, a flat face in the middle, in-SVG grain clipped to the
// silhouette. Replaces the tiled masonry wall — every material the app has
// kept is a single clean object, and many small stones read as noise, not
// texture. The beam runs past both screen edges (ends live off-canvas) and
// is flush with the top; only the hewn bottom edge shows its cut.
// Deterministic; content renders above.

const VIEW_W = 1600;
const VIEW_H = 120;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

// Slab recipe, but the deep-dungeon cut of the stone: barely above black.
// What shape the wall has should come from the torch pool, not the facets.
const DARK: [number, number, number] = [0x05, 0x04, 0x04];
const LIGHT: [number, number, number] = [0x1e, 0x19, 0x14];
const LIGHT_DIR = { x: -0.55, y: -0.85 };

const hash = (i: number): number => {
  const s = Math.sin((i + 23) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Silhouette, clockwise. Top edge and both ends sit OFF-canvas (the beam is
// mounted flush and continues past the screen); the bottom edge carries the
// hewn waver. preserveAspectRatio="none" stretches this to the bar, so all
// visible facets are horizontal strips — vertical squash stays uniform.
const TOP_XS = [-40, 200, 420, 610, 800, 990, 1180, 1400, 1640];
const BOT_XS = [...TOP_XS].reverse();
const OUTER: Array<[number, number]> = [
  ...TOP_XS.map((x, i): [number, number] => [x, -10 + (hash(i) - 0.5) * 4]),
  ...BOT_XS.map((x, i): [number, number] => [x, 106 + (hash(i + 20) - 0.5) * 14]),
];

// Bevel ring: outline pulled toward the center, barely in x (the ends are
// off-canvas), firmly in y so the visible ring is a narrow strip — the
// slab's proportions, not a wide messy band.
const INNER: Array<[number, number]> = OUTER.map(([x, y], i) => [
  CX + (x - CX) * 0.985,
  CY + (y - CY) * 0.7 + (hash(i + 50) - 0.5) * 5,
]);

function facetFill(a: [number, number], b: [number, number], seed: number): string {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const nx = ey / len;
  const ny = -ex / len;
  let t = (nx * LIGHT_DIR.x + ny * LIGHT_DIR.y + 1) / 2;
  t += (hash(seed) - 0.5) * 0.16; // per-facet variation = the low-poly sparkle
  t = Math.max(0, Math.min(1, t));
  const c = DARK.map((d, i) => Math.round(d + (LIGHT[i] - d) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

const FACETS: Array<{ points: string; fill: string }> = [];
for (let i = 0; i < OUTER.length; i++) {
  const j = (i + 1) % OUTER.length;
  FACETS.push({ points: pts([OUTER[i], OUTER[j], INNER[i]]), fill: facetFill(OUTER[i], OUTER[j], i * 2) });
  FACETS.push({ points: pts([OUTER[j], INNER[j], INNER[i]]), fill: facetFill(OUTER[i], OUTER[j], i * 2 + 1) });
}

export const WallMesh: React.FC = () => {
  const grainId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg
      className="nav-wall-mesh"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Stone grain, generated in-SVG and clipped to the silhouette —
            grain on a container would paint a ghosting rectangle */}
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" result="n" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"
          />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
        {/* Torch pool: a warm light living behind the logo + title (left
            side of the bar), the only thing that gives the black stone its
            shape. userSpaceOnUse so it pins to the title, not the bar. */}
        <radialGradient id={`${grainId}torch`} gradientUnits="userSpaceOnUse" cx="330" cy="66" r="520">
          <stop offset="0" stopColor="rgba(212, 165, 116, 0.16)" />
          <stop offset="0.45" stopColor="rgba(212, 165, 116, 0.07)" />
          <stop offset="1" stopColor="rgba(212, 165, 116, 0)" />
        </radialGradient>
        {/* The corridor recedes into darkness away from the torch */}
        <linearGradient id={`${grainId}depth`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(0,0,0,0)" />
          <stop offset="0.55" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.6)" />
        </linearGradient>
      </defs>
      {/* Facet ring */}
      {FACETS.map((f, i) => (
        <polygon key={i} points={f.points} fill={f.fill} />
      ))}
      {/* Flat face the nav content sits on */}
      <polygon points={pts(INNER)} fill="#0c0a08" />
      {/* Torchlight breathing on the stone — uneven flicker, not a metronome */}
      <polygon points={pts(OUTER)} fill={`url(#${grainId}torch)`}>
        <animate
          attributeName="opacity"
          values="0.75;1;0.82;0.95;0.7;1;0.75"
          dur="7s"
          repeatCount="indefinite"
        />
      </polygon>
      {/* Depth falloff toward the far end of the corridor */}
      <polygon points={pts(OUTER)} fill={`url(#${grainId}depth)`} />
      {/* Grain over the whole stone, following the hewn outline */}
      <polygon points={pts(OUTER)} fill="#fff" filter={`url(#${grainId})`} />
      {/* Dark outline for silhouette definition — constant weight at any
          bar size (the squashed viewBox would otherwise thin it to ~1px) */}
      <polygon points={pts(OUTER)} fill="none" stroke="rgba(0, 0, 0, 0.55)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
