import React from 'react';

// ============================================================================
// LOW-POLY GEM BUTTON MESH
// ============================================================================
// The big action buttons are cut gemstones — Play is an emerald, Test Heroes
// an amethyst, Test Enemies a ruby. Same low-poly technique as the
// compendium slab: an irregular table-cut silhouette, a ring of facets
// shaded by a fixed top-left light, a flat "table" facet for the label, a
// gloss highlight, and a scroll-driven shine band (rides the same
// --scroll-percent variable as the metallic border shine) clipped to the
// stone. Static geometry, deterministic; the button label renders above.

export type GemTone = 'emerald' | 'amethyst' | 'ruby';

const TONES: Record<GemTone, { d: [number, number, number]; l: [number, number, number] }> = {
  emerald: { d: [8, 52, 34], l: [72, 196, 134] },
  amethyst: { d: [46, 24, 76], l: [178, 132, 234] },
  ruby: { d: [74, 12, 30], l: [228, 88, 108] },
};

const VIEW_W = 200;
const VIEW_H = 70;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

// Table-cut silhouette, clockwise, slightly irregular
const OUTER: Array<[number, number]> = [
  [16, 3],
  [100, 6],
  [184, 3],
  [197, 17],
  [194, 36],
  [197, 53],
  [185, 67],
  [98, 64],
  [15, 67],
  [3, 52],
  [6, 34],
  [3, 16],
];

const hash = (i: number): number => {
  const s = Math.sin((i + 41) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Table facet: inset toward center with a little jitter
const INNER: Array<[number, number]> = OUTER.map(([x, y], i) => [
  CX + (x - CX) * 0.76 + (hash(i) - 0.5) * 5,
  CY + (y - CY) * 0.5 + (hash(i + 20) - 0.5) * 5,
]);

const LIGHT_DIR = { x: -0.55, y: -0.85 };

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

function mix(d: [number, number, number], l: [number, number, number], t: number): string {
  const c = d.map((dv, i) => Math.round(dv + (l[i] - dv) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function facetT(a: [number, number], b: [number, number], seed: number): number {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const nx = ey / len;
  const ny = -ex / len;
  return (nx * LIGHT_DIR.x + ny * LIGHT_DIR.y + 1) / 2 + (hash(seed) - 0.5) * 0.2;
}

// Precompute facet geometry + shading factors (color applied per-tone)
const FACETS: Array<{ points: string; t: number }> = [];
for (let i = 0; i < OUTER.length; i++) {
  const j = (i + 1) % OUTER.length;
  FACETS.push({ points: pts([OUTER[i], OUTER[j], INNER[i]]), t: facetT(OUTER[i], OUTER[j], i * 2) });
  FACETS.push({ points: pts([OUTER[j], INNER[j], INNER[i]]), t: facetT(OUTER[i], OUTER[j], i * 2 + 1) });
}

export const GemMesh: React.FC<{ tone: GemTone }> = ({ tone }) => {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = `gemclip${uid}`;
  const shineId = `gemshine${uid}`;
  const { d, l } = TONES[tone];
  return (
    <svg
      className="gem-mesh"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={pts(OUTER)} />
        </clipPath>
        <linearGradient id={shineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,255,255,0)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0.32)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Facet ring */}
      {FACETS.map((f, i) => (
        <polygon key={i} points={f.points} fill={mix(d, l, f.t)} />
      ))}

      {/* Table facet (label sits on this) */}
      <polygon points={pts(INNER)} fill={mix(d, l, 0.42)} />

      {/* Glass gloss on the table, upper-left */}
      <ellipse cx={CX - 34} cy={CY - 9} rx="46" ry="12" fill="rgba(255,255,255,0.10)" transform={`rotate(-6 ${CX - 34} ${CY - 9})`} />

      {/* Scroll-driven shine band, clipped to the stone */}
      <g clipPath={`url(#${clipId})`}>
        <rect className="gem-scroll-shine" x="-46" y="-15" width="46" height="100" fill={`url(#${shineId})`} />
      </g>

      {/* Silhouette definition */}
      <polygon points={pts(OUTER)} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2.5" />
      {/* Lit top edge */}
      <polyline points={pts([OUTER[11], OUTER[0], OUTER[1], OUTER[2], OUTER[3]])} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
    </svg>
  );
};
