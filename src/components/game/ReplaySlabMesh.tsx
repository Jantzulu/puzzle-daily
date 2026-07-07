import React from 'react';

// ============================================================================
// REPLAY SLAB — LOW-POLY STONE, OPEN AT THE BOTTOM
// ============================================================================
// Sibling of the compendium's SlabMesh: the same hand-hewn facet-ring
// language, but the silhouette only has a top edge and two sides — the
// stone runs straight off the bottom of its box. Rendered as a fixed
// bottom sheet, the missing edge reads as a much larger rock rising from
// below the page. Deterministic (sin-hash jitter, same slab every render).

const VIEW_W = 1000;
const VIEW_H = 420;
const CX = VIEW_W / 2;

// Open chain, clockwise from bottom-left: left side up, across the hewn
// top, right side down. First and last points sit ON the bottom edge; the
// bottom itself is never drawn.
const OUTER: Array<[number, number]> = [
  [10, VIEW_H],
  [2, 300],
  [16, 170],
  [6, 84],
  [40, 22],
  [180, 10],
  [430, 22],
  [560, 6],
  [790, 16],
  [952, 12],
  [990, 78],
  [980, 180],
  [996, 296],
  [988, VIEW_H],
];

const hash = (i: number): number => {
  const s = Math.sin((i + 7) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Inner plate chain: pulled toward the horizontal center and toward the
// BOTTOM (the anchor), so the ring thins to nothing at the open edge and
// the plate itself also runs off the bottom of the box. Jitter keeps the
// plate edge hewn. 0.93 vertical: a slim ~9% top band — the original 0.82
// wasted a fifth of the stone's height on bevel before any content.
const INNER: Array<[number, number]> = OUTER.map(([x, y], i) => [
  CX + (x - CX) * 0.94 + (hash(i) - 0.5) * 8,
  VIEW_H + (y - VIEW_H) * 0.93 + (hash(i + 40) - 0.5) * 6,
]);
// Pin the chain ends to the bottom edge so ring and plate stay open
INNER[0][1] = VIEW_H;
INNER[INNER.length - 1][1] = VIEW_H;

// Stone tone ramp, dark → lit (matches the compendium slab)
const DARK: [number, number, number] = [0x16, 0x12, 0x0f];
const LIGHT: [number, number, number] = [0x41, 0x39, 0x2f];
const LIGHT_DIR = { x: -0.55, y: -0.85 }; // light from the upper left

function facetFill(a: [number, number], b: [number, number], seed: number): string {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const nx = ey / len;
  const ny = -ex / len;
  let t = (nx * LIGHT_DIR.x + ny * LIGHT_DIR.y + 1) / 2;
  // Gentler per-facet jitter than the compendium's 0.16: these facets are
  // huge (the mesh stretches), so big tone steps read as hard seam lines.
  t += (hash(seed) - 0.5) * 0.08;
  t = Math.max(0, Math.min(1, t));
  // Compress the ramp: this slab is much taller than the compendium's, so
  // its side facets are large — at full contrast they read as hard black
  // slashes rather than turned stone. Raised floor keeps them dark-grey.
  t = 0.3 + t * 0.6;
  const c = DARK.map((d, i) => Math.round(d + (LIGHT[i] - d) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// Facet ring along the open chain only — no wrap segment, no bottom facets
const FACETS: Array<{ points: string; fill: string }> = [];
for (let i = 0; i < OUTER.length - 1; i++) {
  const j = i + 1;
  FACETS.push({ points: pts([OUTER[i], OUTER[j], INNER[i]]), fill: facetFill(OUTER[i], OUTER[j], i * 2) });
  FACETS.push({ points: pts([OUTER[j], INNER[j], INNER[i]]), fill: facetFill(OUTER[i], OUTER[j], i * 2 + 1) });
}

export const ReplaySlabMesh: React.FC = () => {
  const grainId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg
      className="replay-slab-mesh"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" result="n" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"
          />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
      </defs>
      {/* Facet ring (top + sides only). Each facet strokes itself in its
          own fill: adjacent SVG polygons anti-alias against the background
          along shared edges, which drew a visible hairline down every
          seam — the self-stroke paints over it. */}
      {FACETS.map((f, i) => (
        <polygon key={i} points={f.points} fill={f.fill} stroke={f.fill} strokeWidth="1.5" strokeLinejoin="round" />
      ))}
      {/* Flattened plate the controls sit on — closes across the bottom,
          which is off-screen, so the plate reads as running into the rock */}
      <polygon points={pts(INNER)} fill="#211d1a" />
      {/* Faint gold engraving line around the plate's visible edges */}
      <polyline points={pts(INNER)} fill="none" stroke="rgba(228, 185, 106, 0.1)" strokeWidth="2" />
      {/* Grain over the whole stone */}
      <polygon points={pts(OUTER)} fill="#fff" filter={`url(#${grainId})`} />
      {/* Silhouette outline — polyline, not polygon: the bottom edge must
          never draw. non-scaling-stroke keeps 2px weight at every size.
          Softer than the compendium's (0.55/3px): the tall stretched sides
          made a heavy outline read as a hard dark border. */}
      <polyline points={pts(OUTER)} fill="none" stroke="rgba(0, 0, 0, 0.35)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
