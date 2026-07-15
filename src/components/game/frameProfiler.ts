// ============================================================================
// FRAME PROFILER HUD
// ============================================================================
// On-device frame-time breakdown for the AnimatedGameBoard render loop.
// Exists because the team's test iPhone can't be remote-profiled from a
// Windows dev machine (Safari Web Inspector needs a Mac) — this puts the
// numbers on the screen instead. Buckets each animation frame into phases
// (logic / entity draws / overlays / …) and shows rolling avg + p95 per
// phase, so "is the jank in sprite draws or somewhere else?" is answerable
// on the deployed site. Mirrors staticBake.ts / atmosphere.ts toggle-wise.
//
// Enable:
//   ?perf=1 on the URL          — persists to localStorage until ?perf=0
//   Settings → ⚡ Effects tab    — live checkbox
//   togglePerfHud()             — from the browser console
//
// Reading the HUD: "other" is main-thread time between rAF callbacks that
// this loop didn't spend — React renders, GC, event handlers, and the
// browser's own raster/composite of the 2x canvas. Draw-bound jank shows up
// in `entities`/`vignette`; GC or React churn shows up in `other`.
//
// Module-level singleton: assumes one board animating at a time (true today —
// playtest mounts <Game/>, editors don't run this loop). Zero overhead when
// disabled: every hook is a single boolean check.

const TOGGLE_KEY = 'perf_hud';
const WINDOW_SIZE = 120; // ~2s at 60fps
const HUD_UPDATE_EVERY = 30; // frames
const MAX_INTERVAL_MS = 250; // clamp tab-background gaps out of the stats

export const PROF_PHASES = [
  'prep', // clear + transform setup before the first explicit phase mark
  'logic',
  'static',
  'items',
  'projectiles',
  'particles',
  'entities',
  'overlays',
  'vignette',
] as const;
export type ProfPhase = (typeof PROF_PHASES)[number];

let toggleCache: boolean | null = null;

export function perfHudEnabled(): boolean {
  if (toggleCache === null) {
    try {
      toggleCache = localStorage.getItem(TOGGLE_KEY) === 'on';
    } catch {
      toggleCache = false;
    }
  }
  return toggleCache;
}

export function setPerfHudEnabled(on: boolean): void {
  toggleCache = on;
  try {
    localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off');
  } catch { /* private-mode etc. — session-only toggle still works */ }
  if (!on) removeHud();
}

// URL flag — checked once at module load. ?perf=1 turns the HUD on and
// persists it (so it survives SPA navigation and the next visit); ?perf=0
// turns it off again.
if (typeof window !== 'undefined') {
  try {
    const flag = new URLSearchParams(window.location.search).get('perf');
    if (flag === '1') setPerfHudEnabled(true);
    else if (flag === '0') setPerfHudEnabled(false);
  } catch { /* ignore malformed URLs */ }
  (window as unknown as Record<string, unknown>).togglePerfHud = () => {
    setPerfHudEnabled(!perfHudEnabled());
    return perfHudEnabled() ? 'perf HUD ON' : 'perf HUD OFF';
  };
}

// --- per-frame accumulation ------------------------------------------------

// Preallocated ring buffers — no per-frame allocation while profiling.
const phaseRings = new Map<ProfPhase, Float64Array>(
  PROF_PHASES.map(p => [p, new Float64Array(WINDOW_SIZE)])
);
const intervalRing = new Float64Array(WINDOW_SIZE);
const workRing = new Float64Array(WINDOW_SIZE);
let ringCursor = 0;
let ringCount = 0;

const phaseAcc = new Map<ProfPhase, number>(PROF_PHASES.map(p => [p, 0]));
let currentPhase: ProfPhase | null = null;
let phaseStart = 0;
let frameStart = 0;
let lastFrameStart = 0;
let framesSinceHudUpdate = 0;

/** Call at the top of the animate() callback. Starts the 'prep' phase. */
export function profFrameStart(): void {
  if (!perfHudEnabled()) return;
  const t = performance.now();
  lastFrameStart = frameStart;
  frameStart = t;
  for (const p of PROF_PHASES) phaseAcc.set(p, 0);
  currentPhase = 'prep';
  phaseStart = t;
}

/** Mark a phase boundary: time since the previous mark is attributed to the
 * phase that was running. Phases may be re-entered; time accumulates. */
export function profPhase(next: ProfPhase): void {
  if (!perfHudEnabled()) return;
  const t = performance.now();
  if (currentPhase) phaseAcc.set(currentPhase, phaseAcc.get(currentPhase)! + (t - phaseStart));
  currentPhase = next;
  phaseStart = t;
}

/** Call at the bottom of the animate() callback, before scheduling the next
 * frame. Context numbers are shown in the HUD header. */
export function profFrameEnd(canvasW: number, canvasH: number, dpr: number, zoom: number): void {
  if (!perfHudEnabled()) return;
  const t = performance.now();
  if (currentPhase) phaseAcc.set(currentPhase, phaseAcc.get(currentPhase)! + (t - phaseStart));
  currentPhase = null;

  const work = t - frameStart;
  // Interval = spacing between successive rAF callbacks. Only meaningful once
  // two frames have run; clamp the giant gap after a backgrounded tab.
  const interval = lastFrameStart > 0 ? Math.min(frameStart - lastFrameStart, MAX_INTERVAL_MS) : 0;

  for (const p of PROF_PHASES) phaseRings.get(p)![ringCursor] = phaseAcc.get(p)!;
  workRing[ringCursor] = work;
  intervalRing[ringCursor] = interval;
  ringCursor = (ringCursor + 1) % WINDOW_SIZE;
  if (ringCount < WINDOW_SIZE) ringCount++;

  if (++framesSinceHudUpdate >= HUD_UPDATE_EVERY) {
    framesSinceHudUpdate = 0;
    updateHud(canvasW, canvasH, dpr, zoom);
  }
}

// --- stats + HUD -------------------------------------------------------------

/** Rolling stats over the current window — for tests and future automated
 * before/after perf comparisons (e.g. validating the sprite-cache win).
 * Returns null until at least one frame has completed. */
export function profSnapshot(): {
  frames: number;
  avgWorkMs: number;
  avgIntervalMs: number;
  phases: Record<ProfPhase, { avg: number; p95: number }>;
} | null {
  if (ringCount === 0) return null;
  const [avgWorkMs] = avgAndP95(workRing, ringCount);
  const [avgIntervalMs] = avgAndP95(intervalRing, ringCount);
  const phases = {} as Record<ProfPhase, { avg: number; p95: number }>;
  for (const p of PROF_PHASES) {
    const [avg, p95] = avgAndP95(phaseRings.get(p)!, ringCount);
    phases[p] = { avg, p95 };
  }
  return { frames: ringCount, avgWorkMs, avgIntervalMs, phases };
}

function avgAndP95(ring: Float64Array, n: number): [number, number] {
  const vals = Array.from(ring.subarray(0, n)).sort((a, b) => a - b);
  let sum = 0;
  for (const v of vals) sum += v;
  return [sum / n, vals[Math.min(n - 1, Math.floor(n * 0.95))]];
}

let hudEl: HTMLDivElement | null = null;

function ensureHud(): HTMLDivElement {
  if (hudEl && document.body.contains(hudEl)) return hudEl;
  const el = document.createElement('div');
  el.id = 'perf-hud';
  Object.assign(el.style, {
    position: 'fixed',
    top: 'env(safe-area-inset-top, 0px)',
    left: '0',
    zIndex: '9999',
    background: 'rgba(0, 0, 0, 0.72)',
    color: '#7fdc7f',
    font: '10px/1.35 monospace',
    whiteSpace: 'pre',
    padding: '4px 6px',
    pointerEvents: 'none',
    borderBottomRightRadius: '4px',
    textAlign: 'left',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  hudEl = el;
  return el;
}

function removeHud(): void {
  if (hudEl) {
    hudEl.remove();
    hudEl = null;
  }
  ringCursor = 0;
  ringCount = 0;
  framesSinceHudUpdate = 0;
  frameStart = 0;
  lastFrameStart = 0;
}

function updateHud(canvasW: number, canvasH: number, dpr: number, zoom: number): void {
  if (typeof document === 'undefined') return;
  const n = ringCount;
  if (n === 0) return;

  const [avgInterval, p95Interval] = avgAndP95(intervalRing, n);
  const [avgWork] = avgAndP95(workRing, n);
  const fps = avgInterval > 0 ? 1000 / avgInterval : 0;

  // Frames whose rAF spacing blew past ~1.5 vsync intervals = visible hitches.
  let longFrames = 0;
  for (let i = 0; i < n; i++) if (intervalRing[i] > 25) longFrames++;

  const lines: string[] = [
    `${fps.toFixed(0)}fps  work ${avgWork.toFixed(1)}ms  hitch ${(100 * longFrames / n).toFixed(0)}%  p95 ${p95Interval.toFixed(1)}ms`,
    `${canvasW}x${canvasH} dpr${dpr} zoom${zoom}       avg | p95`,
  ];
  let otherAvg = avgInterval - avgWork;
  for (const p of PROF_PHASES) {
    const [avg, p95] = avgAndP95(phaseRings.get(p)!, n);
    lines.push(`${p.padEnd(11)} ${avg.toFixed(2).padStart(5)} | ${p95.toFixed(2).padStart(5)}`);
  }
  if (otherAvg < 0) otherAvg = 0;
  lines.push(`${'other'.padEnd(11)} ${otherAvg.toFixed(2).padStart(5)} |     -`);

  ensureHud().textContent = lines.join('\n');
}
