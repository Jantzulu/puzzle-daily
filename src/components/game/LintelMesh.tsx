import React from 'react';

// ============================================================================
// THRESHOLD LINTEL — the Dungeon Details doorframe
// ============================================================================
// The divider between the heroes' panel and the dungeon's is a course of
// hand-quarried stones, drawn after the game's own painted wall-border
// art: chunky irregular blocks with rounded-octagon silhouettes, lit tops
// catching the fixed top-left light, bottoms falling into shade, and
// near-black gaps between them. Widths vary; a slot occasionally holds
// two small stacked stones, like the painted course does. Same mesh-family
// rules as PortcullisMesh/BannerMesh: polygons only (preserveAspectRatio
// "none" stretches circles into ellipses), deterministic hash jitter, no
// clock and no Math.random. The engraved label renders above in the DOM.

const VIEW_W = 400;
const VIEW_H = 38;

const hash = (i: number): number => {
  const s = Math.sin((i + 7) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Painterly stone tones sampled from the wall-border art: warm grey-taupe
// faces, lighter tops, shaded bottoms, near-black mortar. Four families so
// neighboring stones never read as copies.
const FACES = ['#6d6357', '#665c51', '#75695c', '#5f564c'];
const LITS = ['#8b8071', '#847768', '#948676', '#7c7264'];
const DARKS = ['#4a4239', '#453d34', '#50473d', '#3f382f'];
const MORTAR = '#14100c';

type Pt = [number, number];
const pts = (arr: Pt[]) =>
  arr.map(p => `${p[0].toFixed(1)},${Math.max(0.4, Math.min(VIEW_H - 0.4, p[1])).toFixed(1)}`).join(' ');

interface Stone {
  body: string;
  lit: string;
  shade: string;
  tone: number;
}

function makeStone(x0: number, w: number, top: number, bot: number, seed: number): Stone {
  let s = seed;
  const j = (amp: number) => (hash(s++) - 0.5) * amp;
  const c = () => 3 + hash(s++) * 4.5; // corner cut, 3–7.5u
  const x1 = x0 + w;
  const h = bot - top;

  // Rounded-octagon silhouette, clockwise from the left edge: corner cuts
  // plus a mid-edge bump on top and bottom make the block read as a
  // hand-rounded stone rather than a machined rect
  const lt: Pt = [x0 + j(1), top + c() * 0.9];
  const tl: Pt = [x0 + c(), top + j(1.6)];
  const tm: Pt = [x0 + w * (0.35 + hash(s++) * 0.3), top - 0.6 + j(1.2)];
  const tr: Pt = [x1 - c(), top + j(1.6)];
  const rt: Pt = [x1 + j(1.2), top + h * (0.28 + hash(s++) * 0.12)];
  const rb: Pt = [x1 - 0.8 + j(1.4), bot - c() * 0.7];
  const br: Pt = [x1 - c(), bot + j(1.2)];
  const bm: Pt = [x0 + w * (0.45 + hash(s++) * 0.3), bot + 0.6 + j(1.2)];
  const bl: Pt = [x0 + c(), bot + j(1.2)];
  const lb: Pt = [x0 + j(1.2), bot - h * (0.25 + hash(s++) * 0.12)];

  const outline: Pt[] = [lt, tl, tm, tr, rt, rb, br, bm, bl, lb];

  // Lit cap: the top chain closed by an inner chain roughly a third down
  // the face — the painted stones' bright upper plane
  const capDrop = h * (0.3 + hash(s++) * 0.1);
  const capInner: Pt[] = [
    [rt[0] - 2, rt[1] + capDrop * 0.7],
    [tm[0] + j(4), tm[1] + capDrop],
    [tl[0] + 1.5, tl[1] + capDrop * 0.8],
    [lt[0] + 2, lt[1] + capDrop * 0.6],
  ];

  // Shade: the bottom chain closed by an inner chain a quarter up the face
  const shadeRise = h * (0.2 + hash(s++) * 0.08);
  const shadeInner: Pt[] = [
    [rb[0] - 2, rb[1] - shadeRise * 0.7],
    [bm[0] + j(4), bm[1] - shadeRise],
    [bl[0] + 1.5, bl[1] - shadeRise * 0.8],
    [lb[0] + 2, lb[1] - shadeRise * 0.6],
  ];

  return {
    body: pts(outline),
    lit: pts([lt, tl, tm, tr, rt, ...capInner]),
    shade: pts([lb, bl, bm, br, rb, ...shadeInner]),
    tone: Math.floor(hash(s++) * FACES.length) % FACES.length,
  };
}

const STONES: Stone[] = (() => {
  const stones: Stone[] = [];
  let x = 1.5;
  let i = 0;
  while (x < VIEW_W - 12) {
    const rem = VIEW_W - 1.5 - x;
    let w = 26 + hash(i * 31 + 11) * 38;
    if (rem - w < 22) w = rem; // last stone absorbs the remainder
    const gap = 2.5 + hash(i * 37 + 17) * 1.5;
    if (w < 36 && w < rem && hash(i * 41 + 23) > 0.62) {
      // A slot with two small stacked stones, like the painted course
      const split = VIEW_H / 2 + (hash(i * 43 + 29) - 0.5) * 3;
      stones.push(makeStone(x, w, 2, split - 1.5, i * 100 + 1));
      stones.push(makeStone(x + (hash(i * 47 + 31) - 0.5) * 2, w, split + 1.5, VIEW_H - 2, i * 100 + 53));
    } else {
      stones.push(makeStone(x, w, 2, VIEW_H - 2, i * 100 + 1));
    }
    x += w + gap;
    i++;
  }
  return stones;
})();

export const LintelMesh: React.FC = () => (
  <svg
    className="dungeon-lintel-mesh"
    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {/* Mortar bed — the near-black gaps between stones */}
    <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={MORTAR} />

    {STONES.map((st, i) => (
      <g key={i}>
        <polygon points={st.body} fill={FACES[st.tone]} stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1.2" />
        <polygon points={st.lit} fill={LITS[st.tone]} />
        <polygon points={st.shade} fill={DARKS[st.tone]} />
      </g>
    ))}
  </svg>
);
