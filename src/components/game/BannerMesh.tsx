import React from 'react';

// ============================================================================
// LOW-POLY QUEST BANNER MESH
// ============================================================================
// The quest HUD's stone banner — SlabMesh's cousin (see compendium/SlabMesh):
// flush at the top where it hangs from the navbar, chiseled facet ring down
// the sides and along the hewn bottom hem, flattened plate for the quest
// text. Static SVG, deterministic, real DOM content renders on top.

const VIEW_W = 1000;
const VIEW_H = 200;
const CX = VIEW_W / 2;

// Outer silhouette, clockwise. Top edge dead straight at y=0 (it meets the
// navbar); sides and bottom are hand-hewn.
const OUTER: Array<[number, number]> = [
  [0, 0],
  [1000, 0],
  [996, 58],
  [1000, 118],
  [966, 196],
  [820, 186],
  [658, 198],
  [500, 189],
  [342, 197],
  [178, 187],
  [34, 195],
  [2, 116],
  [5, 56],
];

const hash = (i: number): number => {
  const s = Math.sin((i + 11) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Inner plate: flush at the top (y=0 stays 0), inset along sides and bottom
const INNER: Array<[number, number]> = OUTER.map(([x, y], i) => [
  CX + (x - CX) * 0.96 + (y === 0 ? 0 : (hash(i) - 0.5) * 8),
  y * 0.8 + (y === 0 ? 0 : (hash(i + 60) - 0.5) * 8),
]);

const DARK: [number, number, number] = [0x16, 0x12, 0x0f];
const LIGHT: [number, number, number] = [0x41, 0x39, 0x2f];
const LIGHT_DIR = { x: -0.55, y: -0.85 };

function facetFill(a: [number, number], b: [number, number], seed: number): string {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const nx = ey / len;
  const ny = -ex / len;
  let t = (nx * LIGHT_DIR.x + ny * LIGHT_DIR.y + 1) / 2;
  t += (hash(seed) - 0.5) * 0.16;
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

// Hewn hem outline: every edge except the straight top (index 1 → 0)
const HEM = OUTER.slice(1).concat([OUTER[0]]);

export const BannerMesh: React.FC = () => {
  const grainId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg
      className="quest-banner-mesh"
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
      {FACETS.map((f, i) => (
        <polygon key={i} points={f.points} fill={f.fill} />
      ))}
      {/* Flattened plate for the quest text */}
      <polygon points={pts(INNER)} fill="#211d1a" />
      {/* Stone grain, clipped to the banner silhouette */}
      <polygon points={pts(OUTER)} fill="#fff" filter={`url(#${grainId})`} />
      {/* Gold hem line along the hewn edges (not the navbar seam) */}
      <polyline points={pts(HEM)} fill="none" stroke="rgba(228, 185, 106, 0.28)" strokeWidth="2.5" />
    </svg>
  );
};
