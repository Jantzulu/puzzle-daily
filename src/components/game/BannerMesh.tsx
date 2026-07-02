import React from 'react';

// ============================================================================
// WAR BANNER — the quest HUD's cloth
// ============================================================================
// A weathered war banner on an iron rod. Single dark-red field (heraldic
// bands and loud fold stripes were tried and hurt quest-text legibility),
// whisper-subtle drape shading, and a heavily TATTERED hem — irregular torn
// points, not a clean crescent. Cloth loops pin it over the rod.
//
// Alive: an animated turbulence-displacement filter warps the hanging cloth
// continuously (wind), plus a SMIL two-pose hem ripple. The rod and the
// pinned loops stay rigid — mounted iron doesn't sway.

const VIEW_W = 1000;
const VIEW_H = 240;

// Cloth silhouette, clockwise. Top hangs at y=22 just under the rod; the
// hem is torn — two long tails, secondary rips, an uneven center notch.
const OUTER: Array<[number, number]> = [
  [24, 22],
  [976, 22],
  [970, 64],
  [980, 108],
  [966, 152],
  [974, 205],
  [948, 236],
  [905, 200],
  [872, 216],
  [800, 190],
  [742, 202],
  [684, 184],
  [628, 197],
  [566, 182],
  [522, 190],
  [488, 180],
  [452, 192],
  [395, 182],
  [345, 196],
  [280, 186],
  [225, 206],
  [170, 194],
  [118, 224],
  [84, 204],
  [52, 230],
  [32, 198],
  [40, 150],
  [26, 100],
  [35, 56],
];

const hash = (i: number): number => {
  const s = Math.sin((i + 23) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const pts = (arr: Array<[number, number]>) => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// Second drape pose for the hem ripple — lower half drifts, top stays pinned
const OUTER_B: Array<[number, number]> = OUTER.map(([x, y], i) => {
  if (y <= 22) return [x, y];
  const sway = y > 120 ? 1 : 0.35;
  return [
    x + (hash(i + 80) - 0.5) * 22 * sway,
    y + (hash(i + 90) - 0.5) * 14 * sway,
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

// (Fold strips removed — even at low alpha they read as alternating color
// stripes on OLED screens and fought the quest text. The cloth is a single
// uniform red; the wind displacement provides all the surface life.)

// Cloth loops pinning the banner over the rod (rigid, drawn above the rod)
const LOOPS = [110, 310, 500, 690, 890];

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
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" result="n" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"
          />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
        {/* Wind: animated turbulence displaces the hanging cloth organically */}
        <filter id={windId} x="-6%" y="-15%" width="112%" height="130%">
          {/* One octave, LOW frequency: a couple of long slow undulations.
              Higher frequencies made many small waves — jelly-wiggle, not
              cloth billow. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.015" numOctaves="1" seed="7" result="w">
            <animate
              attributeName="baseFrequency"
              values="0.004 0.015;0.006 0.024;0.004 0.015"
              dur="8s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          {/* Same long wavelengths, bigger amplitude: billow you can see */}
          <feDisplacementMap in="SourceGraphic" in2="w" scale="22" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      {/* Hanging cloth, inside the wind */}
      <g filter={`url(#${windId})`}>
        <polygon points={pts(OUTER)} fill="#451614">
          <PointsRipple a={pts(OUTER)} b={pts(OUTER_B)} />
        </polygon>

        <g clipPath={`url(#${clipId})`}>
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

      {/* Iron rod — robust, rigid, mounted on the wall */}
      <rect x="2" y="4" width="996" height="14" rx="7" fill="#211d19" />
      <rect x="4" y="6" width="992" height="10" rx="5" fill="#403a32" />
      <rect x="4" y="6" width="992" height="4" rx="2" fill="rgba(255, 235, 200, 0.24)" />
      <circle cx="12" cy="11" r="11" fill="#4a443b" stroke="rgba(0,0,0,0.6)" strokeWidth="2" />
      <circle cx="988" cy="11" r="11" fill="#4a443b" stroke="rgba(0,0,0,0.6)" strokeWidth="2" />

      {/* Cloth loops pinning the banner over the rod (rigid with the rod) */}
      {LOOPS.map((lx, i) => (
        <rect key={i} x={lx - 16} y="0" width="32" height="26" rx="4" fill="#3a1210" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
      ))}
    </svg>
  );
};
