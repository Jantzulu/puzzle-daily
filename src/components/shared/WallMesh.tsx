import React from 'react';

// ============================================================================
// CASTLE WALL MESH — the navbar's stone
// ============================================================================
// Rubble masonry, not coursed brick: fewer, larger stones with irregular
// polygonal outlines (6 jittered vertices each), uneven row boundaries, dark
// tones, thick mortar seams. Each stone gets its own shade plus a lit upper
// edge and shadowed base (shared top-left light). Wide viewBox with slice
// fitting so stones CROP at narrow widths instead of stretching.
// Deterministic; content renders above.

const VIEW_W = 1600;
const VIEW_H = 120;
const MORTAR = '#0f0c0a';

const hash = (i: number): number => {
  const s = Math.sin((i + 57) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const DARK: [number, number, number] = [0x1b, 0x17, 0x14];
const LIGHT: [number, number, number] = [0x35, 0x2e, 0x27];

// Pure tone mix — NO hidden jitter. The old version added ±0.27 random on
// top of the lighting, which made facets noisy; the slab's cleanliness
// comes from lighting-dominated shading with only tiny explicit variance.
function tone(t: number): string {
  const tt = Math.max(0, Math.min(1, t));
  const c = DARK.map((d, i) => Math.round(d + (LIGHT[i] - d) * tt));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

interface Stone {
  facets: Array<{ points: string; fill: string }>;
  face: { points: string; fill: string };
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

const LIGHT_DIR = { x: -0.55, y: -0.85 };

// Two uneven rows of big stones, each built EXACTLY like the compendium
// slab: an irregular outline, a ring of lit bevel facets around the edge,
// and a FLAT FACE in the middle (not a fan pinched to the center).
// Irregularity comes from inward-only corner insets, so stones can never
// cross their seams — no overlap.
const STONES: Stone[] = [];
{
  const rows = [
    { y0: -4, y1: 58, light: 0.6 },
    { y0: 62, y1: 124, light: 0.4 },
  ];
  let seed = 0;
  rows.forEach((row, r) => {
    let x = r % 2 === 0 ? -40 : -140;
    while (x < VIEW_W) {
      const w = 130 + hash(seed + 1) * 130; // 130–260: big stones
      const x2 = Math.min(x + w, VIEW_W + 160);
      const inset = (k: number) => 2 + hash(seed + k) * 7; // inward only
      const wob = (k: number, amp: number) => (hash(seed + k) - 0.5) * amp;
      const outline: Array<[number, number]> = [
        [x + inset(2), row.y0 + inset(3)],
        [(x + x2) / 2 + wob(4, 30), row.y0 + inset(5) * 0.6],
        [x2 - inset(6), row.y0 + inset(7)],
        [x2 - inset(8), row.y1 - inset(9)],
        [(x + x2) / 2 + wob(10, 30), row.y1 - inset(11) * 0.6],
        [x + inset(12), row.y1 - inset(13)],
      ];
      const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
      const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
      // Flat face: outline pulled toward the center with gentle jitter —
      // the NARROW bevel ring between outline and face is the slab look
      // (a wide ring dominated the stone and read messy)
      const innerPts: Array<[number, number]> = outline.map(([px, py], i) => [
        cx + (px - cx) * 0.8 + (hash(seed + 80 + i) - 0.5) * 5,
        cy + (py - cy) * 0.75 + (hash(seed + 90 + i) - 0.5) * 5,
      ]);
      const base = row.light;
      const facets: Array<{ points: string; fill: string }> = [];
      outline.forEach((p, i) => {
        const q = outline[(i + 1) % outline.length];
        const ex = q[0] - p[0];
        const ey = q[1] - p[1];
        const len = Math.hypot(ex, ey) || 1;
        const d = ((ey / len) * LIGHT_DIR.x + (-ex / len) * LIGHT_DIR.y + 1) / 2;
        const t1 = base + (d - 0.5) * 0.45 + (hash(seed + 40 + i) - 0.5) * 0.08;
        const t2 = base + (d - 0.5) * 0.45 + (hash(seed + 50 + i) - 0.5) * 0.08;
        facets.push({ points: pts([p, q, innerPts[i]]), fill: tone(t1) });
        facets.push({ points: pts([q, innerPts[(i + 1) % outline.length], innerPts[i]]), fill: tone(t2) });
      });
      STONES.push({
        facets,
        face: { points: pts(innerPts), fill: tone(base + 0.04 + (hash(seed + 5) - 0.5) * 0.06) },
      });
      x = x2 + 4;
      seed += 17;
    }
  });
}

export const WallMesh: React.FC = () => (
  <svg
    className="nav-wall-mesh"
    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    {/* Mortar behind everything */}
    <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={MORTAR} />
    {STONES.map((s, i) => (
      <g key={i}>
        {s.facets.map((f, fi) => (
          <polygon key={fi} points={f.points} fill={f.fill} />
        ))}
        <polygon points={s.face.points} fill={s.face.fill} />
      </g>
    ))}
    {/* Base of the wall falls into shadow where the page begins */}
    <rect x="0" y={VIEW_H - 14} width={VIEW_W} height="14" fill="url(#navWallBase)" />
    <defs>
      <linearGradient id="navWallBase" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(0,0,0,0.55)" />
      </linearGradient>
    </defs>
  </svg>
);
