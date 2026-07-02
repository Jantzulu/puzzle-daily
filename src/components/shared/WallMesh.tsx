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

function tone(seed: number, bias: number): string {
  const t = Math.max(0, Math.min(1, bias + (hash(seed) - 0.5) * 0.55));
  const c = DARK.map((d, i) => Math.round(d + (LIGHT[i] - d) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

interface Stone {
  facets: Array<{ points: string; fill: string }>;
  top: string;
  bottom: string;
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

const LIGHT_DIR = { x: -0.55, y: -0.85 };

// Two uneven rows of big stones. Irregularity comes from INWARD-ONLY corner
// insets (stones can never cross their seam — no overlap, no slop) and from
// each stone being a faceted mini-slab: a triangle fan from its center with
// per-facet lighting, the same treatment as the compendium slab's border.
const STONES: Stone[] = [];
{
  const rows = [
    { y0: -4, y1: 58, light: 0.62 },
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
      const base = row.light;
      const facets = outline.map((p, i) => {
        const q = outline[(i + 1) % outline.length];
        // Facet lit by its outer edge's normal, like the slab
        const ex = q[0] - p[0];
        const ey = q[1] - p[1];
        const len = Math.hypot(ex, ey) || 1;
        const d = ((ey / len) * LIGHT_DIR.x + (-ex / len) * LIGHT_DIR.y + 1) / 2;
        const t = base + (d - 0.5) * 0.55 + (hash(seed + 40 + i) - 0.5) * 0.18;
        return { points: pts([p, q, [cx, cy]]), fill: tone(seed + 60 + i, t) };
      });
      STONES.push({
        facets,
        top: pts([outline[5], outline[0], outline[1], outline[2]]),
        bottom: pts([outline[2], outline[3], outline[4], outline[5]]),
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
        <polyline points={s.top} fill="none" stroke="rgba(255,235,200,0.06)" strokeWidth="2.5" />
        <polyline points={s.bottom} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="3" />
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
