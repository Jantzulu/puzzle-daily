import React from 'react';

// ============================================================================
// CASTLE WALL MESH — the navbar's stone
// ============================================================================
// Interlocked low-poly stone blocks in running bond with dark mortar seams.
// Each block is a corner-jittered quad with its own tone, a lit top edge and
// a shadowed base (same top-left light as the slab/banner/gems). Wide
// viewBox with slice fitting so blocks CROP at narrow widths instead of
// stretching. Deterministic; content renders above.

const VIEW_W = 1600;
const VIEW_H = 120;
const MORTAR = '#151110';

const hash = (i: number): number => {
  const s = Math.sin((i + 57) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const DARK: [number, number, number] = [0x28, 0x22, 0x1e];
const LIGHT: [number, number, number] = [0x45, 0x3d, 0x34];

function tone(seed: number, rowLight: number): string {
  const t = Math.max(0, Math.min(1, rowLight + (hash(seed) - 0.5) * 0.5));
  const c = DARK.map((d, i) => Math.round(d + (LIGHT[i] - d) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

interface Block {
  quad: string;      // fill polygon
  top: string;       // lit top edge polyline
  bottom: string;    // shadowed bottom edge polyline
  fill: string;
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// Build 3 rows of blocks, running bond, jittered corners
const BLOCKS: Block[] = [];
{
  const ROWS = [
    { y0: 0, y1: 40, light: 0.75 },   // top row catches the most light
    { y0: 43, y1: 80, light: 0.5 },
    { y0: 83, y1: 120, light: 0.35 },
  ];
  let seed = 0;
  ROWS.forEach((row, r) => {
    // Offset alternate rows by half a block for the bond
    let x = r % 2 === 0 ? 0 : -55;
    while (x < VIEW_W) {
      const w = 85 + hash(seed + 1) * 70;
      const x2 = Math.min(x + w, VIEW_W + 60);
      const j = (k: number) => (hash(seed + k) - 0.5) * 5;
      const tl: [number, number] = [x + 2 + j(2), row.y0 + 2 + j(3)];
      const tr: [number, number] = [x2 - 2 + j(4), row.y0 + 2 + j(5)];
      const br: [number, number] = [x2 - 2 + j(6), row.y1 - 2 + j(7)];
      const bl: [number, number] = [x + 2 + j(8), row.y1 - 2 + j(9)];
      BLOCKS.push({
        quad: pts([tl, tr, br, bl]),
        top: pts([bl, tl, tr]),
        bottom: pts([tr, br, bl]),
        fill: tone(seed, row.light),
      });
      x = x2 + 4; // mortar gap
      seed += 10;
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
    {BLOCKS.map((b, i) => (
      <g key={i}>
        <polygon points={b.quad} fill={b.fill} />
        <polyline points={b.top} fill="none" stroke="rgba(255,235,200,0.07)" strokeWidth="2" />
        <polyline points={b.bottom} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2.5" />
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
