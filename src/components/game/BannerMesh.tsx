import React from 'react';

// ============================================================================
// LOW-POLY CLOTH QUEST BANNER
// ============================================================================
// The quest HUD hangs from the navbar as FABRIC, not stone — the dungeon's
// material palette needs variety (stone compendium slab, cloth banner, iron
// and wood elsewhere). Same low-poly SVG technique as SlabMesh, different
// material cues: vertical drape folds instead of a facet ring, a sagging
// pennant-point hem with gold trim and tassels, deep crimson weave.
// Static, deterministic; real DOM content renders on top.

const VIEW_W = 1000;
const VIEW_H = 200;

// Silhouette, clockwise. Straight top (meets the navbar); sides fall with a
// slight inward drift; the hem sags into pennant points.
const OUTER: Array<[number, number]> = [
  [0, 0],
  [1000, 0],
  [994, 72],
  [988, 146],
  [880, 190],
  [788, 148],
  [672, 194],
  [560, 150],
  [500, 186],
  [440, 150],
  [326, 194],
  [212, 148],
  [116, 190],
  [10, 146],
  [5, 70],
];

// Pennant tips (local hem minima) get gold tassels
const TASSELS: Array<[number, number]> = [
  [880, 190],
  [672, 194],
  [500, 186],
  [326, 194],
  [116, 190],
];

const hash = (i: number): number => {
  const s = Math.sin((i + 23) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// Drape folds: vertical low-poly strips alternating catch-light and shadow,
// with a little slant at the hem so the fabric reads as hanging, not ruled.
interface Fold { points: string; fill: string }
const FOLDS: Fold[] = [];
{
  const COLS = 11;
  let x = 8;
  for (let i = 0; i < COLS; i++) {
    const w = (VIEW_W - 16) / COLS + (hash(i) - 0.5) * 30;
    const slant = (hash(i + 31) - 0.5) * 26;
    const x2 = Math.min(x + w, VIEW_W - 8);
    FOLDS.push({
      points: pts([
        [x, 0],
        [x2, 0],
        [x2 + slant, VIEW_H],
        [x + slant, VIEW_H],
      ]),
      fill: i % 2 === 0
        ? `rgba(255, 225, 190, ${(0.03 + hash(i + 7) * 0.04).toFixed(3)})`
        : `rgba(0, 0, 0, ${(0.1 + hash(i + 13) * 0.12).toFixed(3)})`,
    });
    x = x2;
  }
}

// Hem trim: every edge except the straight top
const HEM = OUTER.slice(1).concat([OUTER[0]]);

// Second cloth pose for the ambient ripple: hem and lower sides drift a few
// units; the top stays pinned to the wall. SMIL animates polygon points
// between the poses — the pennant tips visibly sway.
const OUTER_B: Array<[number, number]> = OUTER.map(([x, y], i) => {
  if (y === 0) return [x, y];
  const sway = y > 100 ? 1 : 0.4; // hem moves more than the upper sides
  return [
    x + (hash(i + 80) - 0.5) * 16 * sway,
    y + (hash(i + 90) - 0.5) * 10 * sway,
  ];
});
const HEM_B = OUTER_B.slice(1).concat([OUTER_B[0]]);

const RIPPLE = {
  dur: '7s',
  keyTimes: '0;0.5;1',
  calcMode: 'spline',
  keySplines: '0.45 0 0.55 1;0.45 0 0.55 1',
  repeatCount: 'indefinite',
} as const;

const PointsRipple: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <animate attributeName="points" values={`${a};${b};${a}`} {...RIPPLE} />
);

export const BannerMesh: React.FC = () => {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = `clip${uid}`;
  const grainId = `grain${uid}`;
  return (
    <svg
      className="quest-banner-mesh"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={pts(OUTER)}>
            <PointsRipple a={pts(OUTER)} b={pts(OUTER_B)} />
          </polygon>
        </clipPath>
        {/* Fine weave texture, clipped to the cloth */}
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" result="n" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0"
          />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
      </defs>

      {/* Cloth base — points animate between the two drape poses */}
      <polygon points={pts(OUTER)} fill="#4a1d1a">
        <PointsRipple a={pts(OUTER)} b={pts(OUTER_B)} />
      </polygon>

      {/* Drape folds (clipped to the rippling silhouette) */}
      <g clipPath={`url(#${clipId})`}>
        {FOLDS.map((f, i) => (
          <polygon key={i} points={f.points} fill={f.fill} />
        ))}
        {/* Hem shadow — the fabric curls slightly away from the light */}
        <polygon points={pts(OUTER)} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="14">
          <PointsRipple a={pts(OUTER)} b={pts(OUTER_B)} />
        </polygon>
      </g>

      {/* Weave grain */}
      <polygon points={pts(OUTER)} fill="#fff" filter={`url(#${grainId})`}>
        <PointsRipple a={pts(OUTER)} b={pts(OUTER_B)} />
      </polygon>

      {/* Gold hem trim along the hanging edges */}
      <polyline points={pts(HEM)} fill="none" stroke="rgba(228, 185, 106, 0.45)" strokeWidth="3">
        <animate attributeName="points" values={`${pts(HEM)};${pts(HEM_B)};${pts(HEM)}`} {...RIPPLE} />
      </polyline>

      {/* Tassels at the pennant tips, swaying with the cloth */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 4 4; 0 0"
          dur={RIPPLE.dur}
          keyTimes={RIPPLE.keyTimes}
          calcMode={RIPPLE.calcMode}
          keySplines={RIPPLE.keySplines}
          repeatCount={RIPPLE.repeatCount}
        />
        {TASSELS.map(([tx, ty], i) => (
          <circle key={i} cx={tx} cy={ty} r="6" fill="#c9a25e" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
        ))}
      </g>
    </svg>
  );
};
