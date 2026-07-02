import React from 'react';

// ============================================================================
// HANGING PLANK SIGN — the mobile nav menu
// ============================================================================
// Modeled on a rustic rope-hung sign: horizontal wooden planks with ragged
// ends and visible grain, bound by rope at both sides, hanging from a rope
// triangle. Renders behind the mobile menu's nav links (which are carved
// into the wood). Deterministic low-poly, same family as Wall/Slab/Banner.

const VIEW_W = 400;
const VIEW_H = 340;

const hash = (i: number): number => {
  const s = Math.sin((i + 71) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const DARK: [number, number, number] = [0x4a, 0x35, 0x21];
const LIGHT: [number, number, number] = [0x7d, 0x5e, 0x3c];

function woodTone(seed: number, bias: number): string {
  const t = Math.max(0, Math.min(1, bias + (hash(seed) - 0.5) * 0.4));
  const c = DARK.map((d, i) => Math.round(d + (LIGHT[i] - d) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

interface Plank {
  quad: string;
  fill: string;
  grains: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  topEdge: string;
  bottomEdge: string;
}

// Four planks below the rope area (y 52+), ragged ends, slight offsets
const PLANKS: Plank[] = [];
{
  const rows = [
    { y0: 52, y1: 120 },
    { y0: 126, y1: 194 },
    { y0: 200, y1: 268 },
    { y0: 274, y1: 338 },
  ];
  rows.forEach((row, r) => {
    const seed = r * 31;
    const xl = 8 + (hash(seed) - 0.5) * 14;
    const xr = 392 + (hash(seed + 1) - 0.5) * 14;
    const j = (k: number) => (hash(seed + k) - 0.5) * 6;
    const tl: [number, number] = [xl, row.y0 + j(2)];
    const tr: [number, number] = [xr, row.y0 + j(3)];
    const br: [number, number] = [xr + j(4) * 1.5, row.y1 + j(5)];
    const bl: [number, number] = [xl + j(6) * 1.5, row.y1 + j(7)];
    const grains = Array.from({ length: 3 }, (_, g) => {
      const gy = row.y0 + 14 + g * 18 + (hash(seed + 10 + g) - 0.5) * 8;
      return {
        x1: xl + 20 + hash(seed + 20 + g) * 60,
        y1: gy,
        x2: xr - 20 - hash(seed + 30 + g) * 60,
        y2: gy + (hash(seed + 40 + g) - 0.5) * 6,
      };
    });
    PLANKS.push({
      quad: pts([tl, tr, br, bl]),
      fill: woodTone(seed, 0.55 - r * 0.08), // lower planks slightly darker
      grains,
      topEdge: pts([tl, tr]),
      bottomEdge: pts([bl, br]),
    });
  });
}

// Rope: triangle from the top-center hook down to the two bind points
const ROPE = '#8a6f4d';
const ROPE_DARK = '#5e4a30';

export const PlankMesh: React.FC = () => (
  <svg
    className="nav-plank-mesh"
    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {/* Hanging ropes */}
    <polyline points="200,2 30,58" fill="none" stroke={ROPE_DARK} strokeWidth="7" />
    <polyline points="200,2 370,58" fill="none" stroke={ROPE_DARK} strokeWidth="7" />
    <polyline points="200,2 30,58" fill="none" stroke={ROPE} strokeWidth="4.5" strokeDasharray="7 2.5" />
    <polyline points="200,2 370,58" fill="none" stroke={ROPE} strokeWidth="4.5" strokeDasharray="7 2.5" />

    {/* Planks */}
    {PLANKS.map((p, i) => (
      <g key={i}>
        <polygon points={p.quad} fill={p.fill} />
        <polyline points={p.topEdge} fill="none" stroke="rgba(255,235,200,0.12)" strokeWidth="2.5" />
        <polyline points={p.bottomEdge} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="3" />
        {p.grains.map((g, gi) => (
          <line key={gi} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" />
        ))}
      </g>
    ))}

    {/* Rope bindings wrapping the side edges over all planks */}
    {[28, 372].map((rx, i) => (
      <g key={i}>
        <line x1={rx} y1="50" x2={rx - 8} y2="338" stroke={ROPE_DARK} strokeWidth="8" />
        <line x1={rx} y1="50" x2={rx - 8} y2="338" stroke={ROPE} strokeWidth="5" strokeDasharray="6 3" />
        {/* Knot at the top plank */}
        <circle cx={rx} cy="58" r="8" fill={ROPE} stroke={ROPE_DARK} strokeWidth="2.5" />
      </g>
    ))}
  </svg>
);
