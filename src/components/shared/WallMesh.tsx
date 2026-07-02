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
  poly: string;
  top: string;
  bottom: string;
  fill: string;
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// Two uneven rows of big irregular stones
const STONES: Stone[] = [];
{
  const rows = [
    { y0: -6, y1: 60, light: 0.6 },
    { y0: 64, y1: 126, light: 0.38 },
  ];
  let seed = 0;
  rows.forEach((row, r) => {
    let x = r % 2 === 0 ? -40 : -140;
    while (x < VIEW_W) {
      const w = 130 + hash(seed + 1) * 130; // 130–260: big stones
      const x2 = Math.min(x + w, VIEW_W + 160);
      const j = (k: number, amp: number) => (hash(seed + k) - 0.5) * amp;
      // Six-vertex irregular outline: corners + bulging edge midpoints
      const y0 = row.y0 + j(2, 10);
      const y1 = row.y1 + j(3, 10);
      const tl: [number, number] = [x + 4 + j(4, 12), y0 + 4 + j(5, 8)];
      const tm: [number, number] = [(x + x2) / 2 + j(6, 30), y0 + 2 + j(7, 9)];
      const tr: [number, number] = [x2 - 4 + j(8, 12), y0 + 4 + j(9, 8)];
      const br: [number, number] = [x2 - 4 + j(10, 14), y1 - 4 + j(11, 8)];
      const bm: [number, number] = [(x + x2) / 2 + j(12, 30), y1 - 2 + j(13, 9)];
      const bl: [number, number] = [x + 4 + j(14, 14), y1 - 4 + j(15, 8)];
      STONES.push({
        poly: pts([tl, tm, tr, br, bm, bl]),
        top: pts([bl, tl, tm, tr]),
        bottom: pts([tr, br, bm, bl]),
        fill: tone(seed, row.light),
      });
      x = x2 + 7; // thick mortar seam
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
        <polygon points={s.poly} fill={s.fill} />
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
