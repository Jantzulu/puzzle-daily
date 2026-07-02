import React from 'react';

// ============================================================================
// WAR BANNER — the quest HUD's cloth
// ============================================================================
// Modeled on a weathered war banner: hung from an iron rod, layered heraldry
// (crimson upper field, gold chevron band, dark lower field), ONE deep
// swallowtail notch with ragged edges — no scallops, no tassels.
//
// Alive in two ways:
//  - An SVG turbulence-displacement filter with an animated frequency warps
//    the whole cloth continuously — genuine wind, not a rigid transform.
//  - A SMIL point-ripple sways the hem between two drape poses.
// The rod stays rigid outside the wind filter. Real DOM content renders
// above; deterministic geometry.

const VIEW_W = 1000;
const VIEW_H = 240;

// Cloth silhouette, clockwise. Top edge hangs just below the rod; sides
// taper with ragged nicks; the bottom sweeps into two long tails around a
// deep center notch (apex kept shallow enough to clear the HUD content).
const OUTER: Array<[number, number]> = [
  [22, 16],
  [978, 16],
  [972, 62],
  [982, 112],
  [968, 164],
  [976, 210],
  [950, 235],
  [862, 208],
  [768, 194],
  [655, 188],
  [560, 186],
  [500, 183],
  [438, 187],
  [340, 190],
  [235, 198],
  [140, 212],
  [52, 233],
  [28, 206],
  [36, 158],
  [24, 104],
  [33, 54],
];

const hash = (i: number): number => {
  const s = Math.sin((i + 23) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// Second drape pose for the hem ripple — lower half drifts, top stays pinned
const OUTER_B: Array<[number, number]> = OUTER.map(([x, y], i) => {
  if (y <= 16) return [x, y];
  const sway = y > 120 ? 1 : 0.35;
  return [
    x + (hash(i + 80) - 0.5) * 14 * sway,
    y + (hash(i + 90) - 0.5) * 9 * sway,
  ];
});

const RIPPLE = {
  dur: '8s',
  keyTimes: '0;0.5;1',
  calcMode: 'spline',
  keySplines: '0.45 0 0.55 1;0.45 0 0.55 1',
  repeatCount: 'indefinite',
} as const;

const PointsRipple: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <animate attributeName="points" values={`${a};${b};${a}`} {...RIPPLE} />
);

// Heraldic layers (clipped to the cloth): crimson upper field ending in a
// shallow chevron, gold band along the chevron, dark field below.
const UPPER_FIELD = pts([
  [22, 16], [978, 16], [980, 88], [500, 122], [22, 88],
]);
const CHEVRON: Array<[number, number]> = [
  [982, 86], [500, 120], [20, 86],
];

// Drape folds — vertical low-poly strips, slight hem slant
interface Fold { points: string; fill: string }
const FOLDS: Fold[] = [];
{
  const COLS = 11;
  let x = 24;
  for (let i = 0; i < COLS; i++) {
    const w = (VIEW_W - 48) / COLS + (hash(i) - 0.5) * 30;
    const slant = (hash(i + 31) - 0.5) * 24;
    const x2 = Math.min(x + w, VIEW_W - 24);
    FOLDS.push({
      points: pts([
        [x, 16],
        [x2, 16],
        [x2 + slant, VIEW_H],
        [x + slant, VIEW_H],
      ]),
      fill: i % 2 === 0
        ? `rgba(255, 225, 190, ${(0.03 + hash(i + 7) * 0.035).toFixed(3)})`
        : `rgba(0, 0, 0, ${(0.12 + hash(i + 13) * 0.12).toFixed(3)})`,
    });
    x = x2;
  }
}

export const BannerMesh: React.FC = () => {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = `clip${uid}`;
  const grainId = `grain${uid}`;
  const windId = `wind${uid}`;
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
        {/* Weave grain, clipped to the cloth */}
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" result="n" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"
          />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
        {/* Wind: animated turbulence displaces the whole cloth — edges and
            layers wave organically instead of moving as a rigid sheet */}
        <filter id={windId} x="-6%" y="-15%" width="112%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.03" numOctaves="2" seed="7" result="w">
            <animate
              attributeName="baseFrequency"
              values="0.008 0.03;0.013 0.042;0.008 0.03"
              dur="11s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="w" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      {/* Everything cloth lives inside the wind */}
      <g filter={`url(#${windId})`}>
        {/* Dark lower field = cloth base */}
        <polygon points={pts(OUTER)} fill="#26211c">
          <PointsRipple a={pts(OUTER)} b={pts(OUTER_B)} />
        </polygon>

        <g clipPath={`url(#${clipId})`}>
          {/* Crimson upper field */}
          <polygon points={UPPER_FIELD} fill="#5a1f1c" />
          {/* Gold chevron band, shadowed edge beneath */}
          <polyline points={pts(CHEVRON)} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="16" />
          <polyline points={pts(CHEVRON)} fill="none" stroke="#a3803f" strokeWidth="10" />
          {/* Drape folds over the heraldry */}
          {FOLDS.map((f, i) => (
            <polygon key={i} points={f.points} fill={f.fill} />
          ))}
          {/* Weathered edge darkening */}
          <polygon points={pts(OUTER)} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="16">
            <PointsRipple a={pts(OUTER)} b={pts(OUTER_B)} />
          </polygon>
        </g>

        {/* Weave grain */}
        <polygon points={pts(OUTER)} fill="#fff" filter={`url(#${grainId})`}>
          <PointsRipple a={pts(OUTER)} b={pts(OUTER_B)} />
        </polygon>
      </g>

      {/* Iron hanging rod — rigid, outside the wind */}
      <rect x="4" y="5" width="992" height="9" rx="4.5" fill="#2c2723" />
      <rect x="4" y="5" width="992" height="3.5" rx="1.75" fill="rgba(255,235,200,0.14)" />
      <circle cx="10" cy="9.5" r="8" fill="#3a332c" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
      <circle cx="990" cy="9.5" r="8" fill="#3a332c" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
    </svg>
  );
};
