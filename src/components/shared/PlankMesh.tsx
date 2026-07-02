import React from 'react';

// ============================================================================
// PLANK MENU ITEM — one wooden plank per nav button
// ============================================================================
// The mobile menu is a stack of individual planks, each carrying exactly one
// nav item, strung together by two short vertical rope stubs that reach up
// through the gap to the plank above (the top pair reaches the navbar wall
// and carries the knots). No hanging triangle — it ate too much room.
// Ragged outlines and wood tones vary per plank index. Deterministic.

const VIEW_W = 400;
const VIEW_H = 52;

const hash = (i: number): number => {
  const s = Math.sin((i + 71) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Weathered old timber — darker and grayer than fresh-cut wood
const DARK: [number, number, number] = [0x37, 0x2a, 0x1d];
const LIGHT: [number, number, number] = [0x59, 0x46, 0x31];

function woodTone(seed: number): string {
  const t = 0.35 + hash(seed) * 0.45;
  const c = DARK.map((d, i) => Math.round(d + (LIGHT[i] - d) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

const ROPE = '#8a6f4d';
const ROPE_DARK = '#5e4a30';
const ROPE_X = [72, 328];

export const PlankItemMesh: React.FC<{ index: number; first?: boolean; ropes?: boolean }> = ({ index, first = false, ropes = true }) => {
  const seed = index * 37;
  const j = (k: number, amp: number) => (hash(seed + k) - 0.5) * amp;
  // Ragged plank outline (ends more ragged than the long edges)
  const tl: [number, number] = [4 + j(1, 10), 5 + j(2, 5)];
  const tm: [number, number] = [200 + j(3, 60), 3 + j(4, 4)];
  const tr: [number, number] = [396 + j(5, 10), 5 + j(6, 5)];
  const mr: [number, number] = [398 + j(7, 8), 26 + j(8, 10)];
  const br: [number, number] = [396 + j(9, 10), 47 + j(10, 5)];
  const bm: [number, number] = [200 + j(11, 60), 49 + j(12, 4)];
  const bl: [number, number] = [4 + j(13, 10), 47 + j(14, 5)];
  const ml: [number, number] = [2 + j(15, 8), 26 + j(16, 10)];
  const outline = [tl, tm, tr, mr, br, bm, bl, ml];

  // Extra grain on weathered wood
  const grains = Array.from({ length: 3 }, (_, g) => ({
    x1: 30 + hash(seed + 20 + g) * 80,
    y1: 13 + g * 13 + j(24 + g, 7),
    x2: 370 - hash(seed + 30 + g) * 80,
    y2: 13 + g * 13 + j(34 + g, 7),
  }));

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {/* Rope stubs reaching up through the gap to whatever's above
          (omitted for wall-mounted planks like the desktop nav) */}
      {ropes && ROPE_X.map((rx, i) => (
        <g key={i}>
          <line x1={rx} y1="-16" x2={rx} y2="10" stroke={ROPE_DARK} strokeWidth="7" />
          <line x1={rx} y1="-16" x2={rx} y2="10" stroke={ROPE} strokeWidth="4.5" strokeDasharray="5 2.5" />
          {first && <circle cx={rx} cy="0" r="7" fill={ROPE} stroke={ROPE_DARK} strokeWidth="2.5" />}
        </g>
      ))}

      {/* The plank */}
      <polygon points={pts(outline)} fill={woodTone(seed)} />
      <polyline points={pts([ml, tl, tm, tr])} fill="none" stroke="rgba(255,235,200,0.14)" strokeWidth="2.5" />
      <polyline points={pts([mr, br, bm, bl])} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="3" />
      {grains.map((g, gi) => (
        <line key={gi} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" />
      ))}
    </svg>
  );
};
