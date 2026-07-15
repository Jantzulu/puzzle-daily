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
// Set by ?perfsweep=1; consumed in profFrameEnd once the board has produced
// enough frames to be warmed up.
let autoSweepPending = false;

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

// URL flags — checked once at module load. ?perf=1 turns the HUD on and
// persists it (so it survives SPA navigation and the next visit); ?perf=0
// turns it off again. ?perfsweep=1 additionally auto-runs the bisection
// sweep once the board has been animating for ~a second.
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('perf');
    if (flag === '1') setPerfHudEnabled(true);
    else if (flag === '0') setPerfHudEnabled(false);
    if (params.get('perfsweep') === '1') {
      setPerfHudEnabled(true);
      autoSweepPending = true;
    }
  } catch { /* ignore malformed URLs */ }
  (window as unknown as Record<string, unknown>).togglePerfHud = () => {
    setPerfHudEnabled(!perfHudEnabled());
    return perfHudEnabled() ? 'perf HUD ON' : 'perf HUD OFF';
  };
}

// --- draw freeze (diagnostic) ------------------------------------------------
// Skips every canvas touch in the board loop (no clearRect, no draws) while
// the loop keeps scheduling frames. Separates "the canvas update is what
// costs" from "the page is slow regardless": if fps recovers with drawing
// frozen, the per-frame canvas raster/composite is what drives the frame
// budget (or drops Safari's ProMotion frame-rate tier); if fps stays low,
// the cost is elsewhere (other loops, page CSS, OS throttling). Board
// visuals stall while frozen — it is strictly a measurement mode.

const FREEZE_KEY = 'freeze_draws';
let freezeCache: boolean | null = null;
// Volatile overrides used by the perf sweep — never persisted, so an
// interrupted sweep can't leave the board frozen after a reload.
let sweepFreeze = false;
let sweepSatPause = false;

export function drawFreezeEnabled(): boolean {
  if (sweepFreeze) return true;
  if (freezeCache === null) {
    try {
      freezeCache = localStorage.getItem(FREEZE_KEY) === 'on';
    } catch {
      freezeCache = false;
    }
  }
  return freezeCache;
}

/** True while the perf sweep wants satellite canvas loops (nav torch,
 * sprite-card thumbnails) to stop drawing. Checked inside those loops. */
export function satellitesPaused(): boolean {
  return sweepSatPause;
}

export function setDrawFreezeEnabled(on: boolean): void {
  freezeCache = on;
  try {
    localStorage.setItem(FREEZE_KEY, on ? 'on' : 'off');
  } catch { /* session-only */ }
}

// --- per-frame accumulation ------------------------------------------------

// Preallocated ring buffers — no per-frame allocation while profiling.
const phaseRings = new Map<ProfPhase, Float64Array>(
  PROF_PHASES.map(p => [p, new Float64Array(WINDOW_SIZE)])
);
const intervalRing = new Float64Array(WINDOW_SIZE);
const workRing = new Float64Array(WINDOW_SIZE);
const lagRing = new Float64Array(WINDOW_SIZE);
const rafsRing = new Float64Array(WINDOW_SIZE);
let ringCursor = 0;
let ringCount = 0;

// Page-wide rAF census: wrap window.requestAnimationFrame (once, on first
// profiled frame) so every callback that runs anywhere on the page — nav
// torch, sprite-card thumbnails, this board — bumps a counter. The count
// between two board frames says how many animation loops the page is really
// running. The wrapper is an increment + passthrough; it stays installed
// once patched (unpatching mid-flight would break ids), but the counter is
// only read while the HUD is on.
let rafCallbackCount = 0;
let rafPatched = false;

function patchRafCensus(): void {
  if (rafPatched || typeof window === 'undefined') return;
  rafPatched = true;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    orig((t: DOMHighResTimeStamp) => {
      rafCallbackCount++;
      cb(t);
    });
}

// Main-thread lag probe: after the board's frame callback returns, how long
// until the task queue gets serviced? The MessageChannel handler runs after
// every other rAF callback and the main-thread part of the rendering steps,
// so this captures "main-thread busy time we didn't spend" — React commits,
// GC, other animation loops. mainlag ≈ 0 while `other` is large means the
// main thread is idle and the gap is compositor/GPU/frame-pacing.
let lagChannel: MessageChannel | null = null;
let lagPingSentAt = 0;
let lastLagMs = 0;

function sendLagPing(): void {
  if (typeof MessageChannel === 'undefined') return;
  if (!lagChannel) {
    lagChannel = new MessageChannel();
    lagChannel.port1.onmessage = () => {
      lastLagMs = performance.now() - lagPingSentAt;
    };
  }
  lagPingSentAt = performance.now();
  lagChannel.port2.postMessage(0);
}

const phaseAcc = new Map<ProfPhase, number>(PROF_PHASES.map(p => [p, 0]));
let currentPhase: ProfPhase | null = null;
let phaseStart = 0;
let frameStart = 0;
let lastFrameStart = 0;
let framesSinceHudUpdate = 0;

/** Call at the top of the animate() callback. Starts the 'prep' phase. */
export function profFrameStart(): void {
  if (!perfHudEnabled()) return;
  patchRafCensus();
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
  // lastLagMs was measured by the ping sent at the END of the previous frame,
  // so it describes the gap this frame's interval covers. rafCallbackCount
  // counts every page-wide rAF callback since the previous board frame
  // (including this one).
  lagRing[ringCursor] = lastLagMs;
  rafsRing[ringCursor] = rafCallbackCount;
  rafCallbackCount = 0;
  lastLagMs = 0;
  ringCursor = (ringCursor + 1) % WINDOW_SIZE;
  if (ringCount < WINDOW_SIZE) ringCount++;

  if (++framesSinceHudUpdate >= HUD_UPDATE_EVERY) {
    framesSinceHudUpdate = 0;
    updateHud(canvasW, canvasH, dpr, zoom);
  }
  sendLagPing();

  // ?perfsweep=1 auto-run: wait until the board has been animating for ~1s
  // so the sweep samples a warmed-up page.
  if (autoSweepPending && ringCount >= 60 && !sweepActive) {
    autoSweepPending = false;
    runPerfSweep();
  }
}

// --- perf sweep ---------------------------------------------------------------
// Automated bisection: cycles through configurations for ~5s each and
// records fps + hitch% per configuration, so one run (one screenshot)
// apportions the frame budget across the board canvas, the satellite canvas
// loops, SMIL SVG animation (the quest banner's cloth ripple re-runs its
// filter chain every tick), CSS animations, and static SVG compositing.
// Trigger: ?perfsweep=1 (auto-runs once the board is warm) or
// runPerfSweep() in the console. All overrides are volatile — an aborted
// sweep leaves nothing behind after a reload.

const SWEEP_SETTLE_MS = 800; // let the config take effect before sampling
const SWEEP_SAMPLE_MS = 4200;

let cssPauseStyle: HTMLStyleElement | null = null;
let svgHideStyle: HTMLStyleElement | null = null;

function setStyleOverride(current: HTMLStyleElement | null, on: boolean, css: string): HTMLStyleElement | null {
  if (on) {
    if (current) return current;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    return el;
  }
  current?.remove();
  return null;
}

function setCssAnimsPaused(on: boolean): void {
  cssPauseStyle = setStyleOverride(
    cssPauseStyle, on,
    '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }'
  );
}

function setSvgsHidden(on: boolean): void {
  svgHideStyle = setStyleOverride(svgHideStyle, on, 'svg { visibility: hidden !important; }');
}

function setSmilPaused(on: boolean): void {
  document.querySelectorAll('svg').forEach(svg => {
    try {
      if (on) svg.pauseAnimations();
      else svg.unpauseAnimations();
    } catch { /* detached or foreign svg */ }
  });
}

interface SweepConfig {
  key: string;
  on: () => void;
  off: () => void;
}

const SWEEP_CONFIGS: SweepConfig[] = [
  { key: 'base', on: () => {}, off: () => {} },
  { key: '-board', on: () => { sweepFreeze = true; }, off: () => { sweepFreeze = false; } },
  { key: '-sat', on: () => { sweepSatPause = true; }, off: () => { sweepSatPause = false; } },
  { key: '-smil', on: () => setSmilPaused(true), off: () => setSmilPaused(false) },
  { key: '-css', on: () => setCssAnimsPaused(true), off: () => setCssAnimsPaused(false) },
  { key: '-svg', on: () => setSvgsHidden(true), off: () => setSvgsHidden(false) },
  {
    key: 'bare',
    on: () => { sweepFreeze = true; sweepSatPause = true; setSmilPaused(true); setCssAnimsPaused(true); setSvgsHidden(true); },
    off: () => { sweepFreeze = false; sweepSatPause = false; setSmilPaused(false); setCssAnimsPaused(false); setSvgsHidden(false); },
  },
];

let sweepActive = false;
let sweepStatusLine: string | null = null;
let sweepResultLines: string[] = [];

function resetWindow(): void {
  ringCursor = 0;
  ringCount = 0;
}

function sampleWindow(): string {
  const n = ringCount;
  if (n < 10) return 'n/a';
  const [avgInterval] = avgAndP95(intervalRing, n);
  let longFrames = 0;
  for (let i = 0; i < n; i++) if (intervalRing[i] > 25) longFrames++;
  const fps = avgInterval > 0 ? 1000 / avgInterval : 0;
  return `${fps.toFixed(0)}fps ${(100 * longFrames / n).toFixed(0)}%h`;
}

export function runPerfSweep(): void {
  if (sweepActive || typeof window === 'undefined') return;
  if (!perfHudEnabled()) setPerfHudEnabled(true);
  sweepActive = true;
  sweepResultLines = [];

  const step = (idx: number): void => {
    if (idx >= SWEEP_CONFIGS.length) {
      sweepActive = false;
      sweepStatusLine = null;
      // Results stay on the HUD until the next sweep or HUD toggle-off.
      console.log('[perf sweep]', sweepResultLines.join('  '));
      return;
    }
    const config = SWEEP_CONFIGS[idx];
    sweepStatusLine = `sweep ${idx + 1}/${SWEEP_CONFIGS.length}: ${config.key}…`;
    config.on();
    window.setTimeout(() => {
      resetWindow();
      window.setTimeout(() => {
        sweepResultLines.push(`${config.key.padEnd(11)} ${sampleWindow()}`);
        config.off();
        step(idx + 1);
      }, SWEEP_SAMPLE_MS);
    }, SWEEP_SETTLE_MS);
  };
  step(0);
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runPerfSweep = runPerfSweep;
}

// --- stats + HUD -------------------------------------------------------------

/** Rolling stats over the current window — for tests and future automated
 * before/after perf comparisons (e.g. validating the sprite-cache win).
 * Returns null until at least one frame has completed. */
export function profSnapshot(): {
  frames: number;
  avgWorkMs: number;
  avgIntervalMs: number;
  avgMainLagMs: number;
  avgRafsPerFrame: number;
  phases: Record<ProfPhase, { avg: number; p95: number }>;
} | null {
  if (ringCount === 0) return null;
  const [avgWorkMs] = avgAndP95(workRing, ringCount);
  const [avgIntervalMs] = avgAndP95(intervalRing, ringCount);
  const [avgMainLagMs] = avgAndP95(lagRing, ringCount);
  const [avgRafsPerFrame] = avgAndP95(rafsRing, ringCount);
  const phases = {} as Record<ProfPhase, { avg: number; p95: number }>;
  for (const p of PROF_PHASES) {
    const [avg, p95] = avgAndP95(phaseRings.get(p)!, ringCount);
    phases[p] = { avg, p95 };
  }
  return { frames: ringCount, avgWorkMs, avgIntervalMs, avgMainLagMs, avgRafsPerFrame, phases };
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
  rafCallbackCount = 0;
  lastLagMs = 0;
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
  const [lagAvg, lagP95] = avgAndP95(lagRing, n);
  const [rafsAvg] = avgAndP95(rafsRing, n);
  lines.push(`${'mainlag'.padEnd(11)} ${lagAvg.toFixed(2).padStart(5)} | ${lagP95.toFixed(2).padStart(5)}`);
  lines.push(`${'rafs/frame'.padEnd(11)} ${rafsAvg.toFixed(1).padStart(5)} |     -`);
  if (drawFreezeEnabled()) lines.push('** DRAWS FROZEN (diagnostic) **');
  if (sweepStatusLine) lines.push(sweepStatusLine);
  for (const l of sweepResultLines) lines.push(l);

  ensureHud().textContent = lines.join('\n');
}
