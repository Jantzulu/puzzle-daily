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
//
// DESKTOP ONLY — mobile renders a static cloth (filters cached) swayed by a
// composited CSS transform instead; see the early return in the component.

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

// Drape poses for the hem ripple — lower half drifts, top stays pinned.
// THREE poses cycling A→B→C→A: the two-pose version read as a single slow
// breath, and on iOS this morph is most of the visible wind (WebKit does
// not animate feTurbulence attributes, so the displacement wind is a
// desktop-only bonus — points morphs and transforms animate everywhere).
const drapePose = (seed: number, ampX: number, ampY: number): Array<[number, number]> =>
  OUTER.map(([x, y], i) => {
    if (y <= 22) return [x, y];
    const sway = y > 120 ? 1 : 0.35;
    return [
      x + (hash(i + seed) - 0.5) * ampX * sway,
      y + (hash(i + seed + 10) - 0.5) * ampY * sway,
    ];
  });

// Mobile takes the static-cloth branch in the component (measured 2026-07-15:
// SMIL-through-filters cost a third of the phone's frame budget); this hook
// picks the branch and re-picks on rotation/resize.
const useIsMobile = (): boolean => {
  const [mobile, setMobile] = React.useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
};

const RIPPLE = {
  dur: '8s',
  keyTimes: '0;0.34;0.67;1',
  calcMode: 'spline',
  keySplines: '0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1',
  repeatCount: 'indefinite',
} as const;

const PointsRipple: React.FC<{ a: string; b: string; c: string }> = ({ a, b, c }) => (
  <animate attributeName="points" values={`${a};${b};${c};${a}`} {...RIPPLE} />
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
  const isMobile = useIsMobile();
  const ripA = pts(OUTER);
  const ripB = React.useMemo(() => pts(drapePose(80, 26, 16)), []);
  const ripC = React.useMemo(() => pts(drapePose(130, 26, 16)), []);
  const swayValues = '0;-1.8;1.2;0';

  // MOBILE: no SMIL at all. Profiled on-device 2026-07-15: every SMIL tick
  // (points ripple + skew sway) re-ran the cloth's filter chain — feDropShadow
  // σ6 over the full banner width plus the turbulence grain — on the CPU,
  // and together with the title glimmer it held the whole page at iOS
  // Safari's 40Hz tier whenever the banner was on screen (perf sweep:
  // pausing SMIL alone recovered a locked 60fps). Here the cloth geometry
  // and filters are fully static — WebKit renders them once and caches —
  // and ALL motion is a composited CSS skew sway on the cloth's own svg
  // (.quest-banner-cloth-sway, transform-only). The rod stays rigid in a
  // separate static svg stacked above.
  if (isMobile) {
    return (
      <>
        <svg
          className="quest-banner-mesh quest-banner-cloth-sway"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipId}>
              <polygon points={ripA} />
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
            <filter id={windId} x="-6%" y="-15%" width="112%" height="130%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="rgba(0, 0, 0, 0.55)" />
            </filter>
          </defs>
          <g filter={`url(#${windId})`}>
            <polygon points={ripA} fill="#451614" />
            <g clipPath={`url(#${clipId})`}>
              <polygon points={ripA} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="16" />
            </g>
            <polygon points={ripA} fill="#fff" filter={`url(#${grainId})`} />
          </g>
        </svg>
        <svg
          className="quest-banner-mesh"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="996" height="14" rx="7" fill="#211d19" />
          <rect x="4" y="6" width="992" height="10" rx="5" fill="#403a32" />
          <rect x="4" y="6" width="992" height="4" rx="2" fill="rgba(255, 235, 200, 0.24)" />
          {LOOPS.map((lx, i) => (
            <rect key={i} x={lx - 16} y="0" width="32" height="26" rx="4" fill="#3a1210" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
          ))}
        </svg>
      </>
    );
  }

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
            <PointsRipple a={ripA} b={ripB} c={ripC} />
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
        {/* Wind: animated turbulence displaces the hanging cloth organically.
            This whole return is DESKTOP ONLY (mobile takes the static-cloth
            early return above — SMIL through a filter chain was a measured
            frame-budget killer on iOS). */}
        <filter id={windId} x="-6%" y="-15%" width="112%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.015" numOctaves="1" seed="7" result="w">
            {/* One octave, LOW frequency: a couple of long slow
                undulations. Higher frequencies made many small waves —
                jelly-wiggle, not cloth billow. */}
            <animate
              attributeName="baseFrequency"
              values="0.004 0.015;0.006 0.024;0.004 0.015"
              dur="8s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="w" scale="22" xChannelSelector="R" yChannelSelector="G" result="cloth" />
          {/* Shadows live INSIDE this filter chain: a CSS drop-shadow on the
              svg used the internal filter's rectangular REGION as its alpha
              source, ghosting a faint box around the banner. In-chain
              feDropShadow computes from the actual cloth alpha. */}
          {/* Black shadow only — a gold glow layer was tried and rejected */}
          <feDropShadow in="cloth" dx="0" dy="6" stdDeviation="6" floodColor="rgba(0, 0, 0, 0.55)" />
        </filter>
      </defs>

      {/* Hanging cloth, inside the wind. The skew sway is the cross-browser
          wind: x-shift grows with y, so the pinned top (y≈22) barely moves
          while the hem swings — flag physics for free. Runs on a 7s cycle
          against the ripple's 8s so the combined motion doesn't visibly
          repeat every loop. GPU-cheap and animates on iOS, unlike the
          turbulence displacement. */}
      <g filter={`url(#${windId})`}>
        <animateTransform
          attributeName="transform"
          type="skewX"
          values={swayValues}
          keyTimes="0;0.38;0.72;1"
          calcMode="spline"
          keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
          dur="7s"
          repeatCount="indefinite"
        />
        <polygon points={pts(OUTER)} fill="#451614">
          <PointsRipple a={ripA} b={ripB} c={ripC} />
        </polygon>

        <g clipPath={`url(#${clipId})`}>
          {/* Weathered edge darkening */}
          <polygon points={pts(OUTER)} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="16">
            <PointsRipple a={ripA} b={ripB} c={ripC} />
          </polygon>
        </g>

        {/* Weave grain */}
        <polygon points={pts(OUTER)} fill="#fff" filter={`url(#${grainId})`}>
          <PointsRipple a={ripA} b={ripB} c={ripC} />
        </polygon>
      </g>

      {/* Iron rod — robust, rigid, mounted on the wall. End finials are NOT
          drawn here: with preserveAspectRatio="none" any circle stretches
          into an ellipse; the round caps are fixed-size CSS dots on
          .quest-banner instead (::before / ::after). */}
      <rect x="2" y="4" width="996" height="14" rx="7" fill="#211d19" />
      <rect x="4" y="6" width="992" height="10" rx="5" fill="#403a32" />
      <rect x="4" y="6" width="992" height="4" rx="2" fill="rgba(255, 235, 200, 0.24)" />

      {/* Cloth loops pinning the banner over the rod (rigid with the rod) */}
      {LOOPS.map((lx, i) => (
        <rect key={i} x={lx - 16} y="0" width="32" height="26" rx="4" fill="#3a1210" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
      ))}
    </svg>
  );
};
