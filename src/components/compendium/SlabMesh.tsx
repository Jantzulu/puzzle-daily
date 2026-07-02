import React from 'react';

// ============================================================================
// LOW-POLY STONE SLAB MESH
// ============================================================================
// A hand-hewn stone slab rendered as a static SVG polygon mesh behind the
// compendium content: an irregular silhouette, a border ring of triangular
// facets shaded by a fixed top-left light, and a flattened plate in the
// center where the (real DOM) text sits. This gives the "low poly 3D stone"
// look with none of the costs of an actual 3D renderer — content stays
// crisp, interactive, and accessible.
//
// Deterministic (sin-hash jitter, same slab every render). The SVG uses
// preserveAspectRatio="none" and the slab containers have FIXED heights,
// so the silhouette is stable across chapters and entries.

const VIEW_W = 1000;
const VIEW_H = 740;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

// Outer silhouette, clockwise — irregular corner cuts and slight edge waver
const OUTER: Array<[number, number]> = [
  [30, 16],
  [180, 6],
  [430, 16],
  [560, 4],
  [790, 12],
  [960, 8],
  [994, 62],
  [988, 210],
  [996, 430],
  [990, 662],
  [946, 732],
  [700, 722],
  [430, 736],
  [180, 724],
  [44, 730],
  [8, 666],
  [16, 430],
  [4, 210],
  [12, 72],
];

const hash = (i: number): number => {
  const s = Math.sin((i + 3) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Inner plate ring: outer pulled toward center (anisotropic so the border
// ring is a similar thickness on all sides of the non-square viewBox),
// with a little jitter so the plate edge is hewn too.
const INNER: Array<[number, number]> = OUTER.map(([x, y], i) => [
  CX + (x - CX) * 0.9 + (hash(i) - 0.5) * 10,
  CY + (y - CY) * 0.856 + (hash(i + 40) - 0.5) * 10,
]);

// Stone tone ramp, dark → lit
const DARK: [number, number, number] = [0x16, 0x12, 0x0f];
const LIGHT: [number, number, number] = [0x41, 0x39, 0x2f];
const LIGHT_DIR = { x: -0.55, y: -0.85 }; // light from the upper left

function facetFill(a: [number, number], b: [number, number], seed: number): string {
  // Outward normal of the outer edge (ring is clockwise, y-down coords)
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const nx = ey / len;
  const ny = -ex / len;
  let t = (nx * LIGHT_DIR.x + ny * LIGHT_DIR.y + 1) / 2; // 0 dark … 1 lit
  t += (hash(seed) - 0.5) * 0.16; // per-facet variation = the low-poly sparkle
  t = Math.max(0, Math.min(1, t));
  const c = DARK.map((d, i) => Math.round(d + (LIGHT[i] - d) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// Build the facet ring once at module load
const FACETS: Array<{ points: string; fill: string }> = [];
for (let i = 0; i < OUTER.length; i++) {
  const j = (i + 1) % OUTER.length;
  FACETS.push({ points: pts([OUTER[i], OUTER[j], INNER[i]]), fill: facetFill(OUTER[i], OUTER[j], i * 2) });
  FACETS.push({ points: pts([OUTER[j], INNER[j], INNER[i]]), fill: facetFill(OUTER[i], OUTER[j], i * 2 + 1) });
}

export const SlabMesh: React.FC = () => {
  // Unique filter id per instance (desktop + mobile both render one)
  const grainId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg
      className="compendium-slab-mesh"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Stone grain, generated in-SVG and clipped to the silhouette —
            grain must never paint a rectangle (a grain rect on the content
            div used to ghost as a faint "screen" against the facets) */}
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
      {/* Facet ring */}
      {FACETS.map((f, i) => (
        <polygon key={i} points={f.points} fill={f.fill} />
      ))}
      {/* Flattened plate the text sits on */}
      <polygon points={pts(INNER)} fill="#211d1a" />
      {/* Faint gold engraving line around the plate edge */}
      <polygon points={pts(INNER)} fill="none" stroke="rgba(228, 185, 106, 0.1)" strokeWidth="2" />
      {/* Grain over the whole stone, following the hewn outline */}
      <polygon points={pts(OUTER)} fill="#fff" filter={`url(#${grainId})`} />
      {/* Dark outline for silhouette definition. non-scaling-stroke: the
          viewBox squashes to the element (preserveAspectRatio=none), which
          thinned the border to ~1px on phones — the outline should be the
          same 3px weight at every size. */}
      <polygon points={pts(OUTER)} fill="none" stroke="rgba(0, 0, 0, 0.55)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
