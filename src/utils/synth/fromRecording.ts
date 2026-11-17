// A FIRST SKETCH OF A RECORDING, as a layered sound (user ask 2026-11-17).
//
// "It can be hard to go from a real life sound to the abstraction of it
// using these simple sounds, and being able to get something that is close
// or even based off of it (level wise) would be a huge boon ... I could
// record real life sounds and jump start editing them by taking that first
// step." And: every part of the sound must be its own layer, "to be able to
// remove/edit specific sounds or layers".
//
// So this is NOT a copy of the recording and does not try to be. It does by
// rule what was done by hand for the portcullis and the sign's creak:
// measure the recording, then say it again in the Forge's own words.
//   1. Trim the silence; keep at most three seconds (the Forge's reach).
//   2. Find the separate HITS (a knock, then a rattle), up to three. A run
//      of more than three is treated as one continuous sound.
//   3. In each hit, find the NOTES: steady pitches that stand clear of what
//      is around them and last, up to six. Each becomes a tone layer. (The
//      ring of struck metal is several such pitches close together.)
//   4. Everything else is NOISE, split into five fixed bands (rumble, body,
//      grit, hiss, air). Each band with enough in it becomes a noise layer.
//   5. Each layer's loudness over time (how fast it arrives, how long it
//      holds, how far it fades) is read off that part of the recording.
//   6. A layer whose loudness keeps jumping about while it sounds (a creak's
//      cracks, a winch's chug) is given a TREMBLE of about that speed and
//      depth. Without it a wooden creak came out as a steady hiss: right
//      in level, wrong in kind.
// What it leaves out, on purpose: wobble, pulse, echo, stacked harmonics,
// pitch that wanders. Those are for the ear to add.
//
// Levels are set afterwards by rendering each layer alone and comparing it
// with the recording (components/editor/soundForge/importRecording.ts): this
// file only says how loud each part WAS (`target`) and where to listen for
// it (`band`). Pure functions of the samples: no audio context, no clock,
// nothing random. The recording itself is never kept.

import type { FilterStage, SynthLayer } from './types';

/** The longest stretch that is used (s): a layer can start up to 2 s in and last 3. */
export const SKETCH_SECONDS = 3;
/** No more separate hits than this; a longer run is one continuous sound. */
const MAX_HITS = 3;
const MAX_NOTES_PER_HIT = 6;
const MAX_LAYERS = 14;

/** The noise bands: a plain name, its edges (Hz), and whether its noise is slowed (more low end to work with). */
const NOISE_BANDS: ReadonlyArray<{ id: string; name: string; lo: number; hi: number; slow: boolean }> = [
  { id: 'rumble', name: 'Rumble', lo: 40, hi: 200, slow: true },
  { id: 'body', name: 'Body', lo: 200, hi: 700, slow: true },
  { id: 'grit', name: 'Grit', lo: 700, hi: 2500, slow: false },
  { id: 'hiss', name: 'Hiss', lo: 2500, hi: 7000, slow: false },
  { id: 'air', name: 'Air', lo: 7000, hi: 16000, slow: false },
];

export interface SketchLayer {
  /** The layer, at level 1: its real level is set by comparing a render with `target`. */
  layer: SynthLayer;
  /** Where this part of the sound lives (Hz). */
  band: readonly [number, number];
  /** How loud that band was in the recording over the layer's own stretch (RMS, in sample units). */
  target: number;
  /** 'note' or the noise band's id. */
  kind: string;
}

export interface RecordingSketch {
  /** How much of the recording was used (s). */
  seconds: number;
  /** How long the recording was, silence trimmed (s): longer than `seconds` means the rest was left out. */
  heardSeconds: number;
  /** How many separate hits were found (a long run counts as 1). */
  hits: number;
  /** True when more hits than MAX_HITS were found and treated as one sound. */
  runTogether: boolean;
  /** The loudest 50 ms of the stretch that was used (RMS), to compare the finished sound with. */
  loudness: number;
  layers: SketchLayer[];
}

// ---- the arithmetic ---------------------------------------------------------------

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

const windows = new Map<number, Float64Array>();
function hann(n: number): Float64Array {
  let w = windows.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    windows.set(n, w);
  }
  return w;
}

/**
 * Power per frequency bin of one windowed frame starting at `at`. Samples
 * outside [from, to) count as silence, so a stretch can be looked at alone.
 */
function framePower(x: Float32Array, at: number, n: number, from: number, to: number): Float64Array {
  const w = hann(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const a = Math.max(at, from, 0);
  const b = Math.min(at + n, to, x.length);
  for (let i = a; i < b; i++) re[i - at] = x[i] * w[i - at];
  fft(re, im);
  const power = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
  return power;
}

/** Frames of `n` samples every `hop`, covering [from, to). */
function spectrogram(x: Float32Array, from: number, to: number, n: number, hop: number): Float64Array[] {
  const frames: Float64Array[] = [];
  for (let at = from - n / 2; at < to; at += hop) frames.push(framePower(x, Math.round(at), n, from, to));
  return frames;
}

const BAND_N = 2048;
/**
 * How loud [t0, t1) is between `lo` and `hi` Hz (RMS, sample units). The
 * SAME measure is used on the recording and on a rendered layer, so only
 * its consistency matters.
 */
export function bandRms(x: Float32Array, sampleRate: number, t0: number, t1: number, lo: number, hi: number): number {
  const from = Math.max(0, Math.round(t0 * sampleRate));
  const to = Math.min(x.length, Math.round(t1 * sampleRate));
  if (to <= from) return 0;
  const hz = sampleRate / BAND_N;
  const first = Math.max(1, Math.ceil(lo / hz));
  const last = Math.min(BAND_N / 2 - 1, Math.floor(hi / hz));
  let sum = 0;
  let count = 0;
  for (let at = from - BAND_N / 2; at < to; at += BAND_N / 4) {
    const power = framePower(x, Math.round(at), BAND_N, from, to);
    for (let i = first; i <= last; i++) sum += power[i];
    count++;
  }
  let windowSum = 0;
  for (const v of hann(BAND_N)) windowSum += v * v;
  return Math.sqrt((2 * sum) / (Math.max(1, count) * BAND_N * windowSum));
}

/** The loudest 50 ms of [from, to) (RMS). */
export function loudest50ms(x: Float32Array, sampleRate: number, from = 0, to = x.length): number {
  const span = Math.round(sampleRate * 0.05);
  const step = Math.round(sampleRate * 0.01);
  let best = 0;
  for (let start = from; start < to; start += step) {
    const end = Math.min(to, start + span);
    let sum = 0;
    for (let i = start; i < end; i++) sum += x[i] * x[i];
    best = Math.max(best, Math.sqrt(sum / span));
  }
  return best;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

// ---- the shape of one layer --------------------------------------------------------

interface Shape { start: number; length: number; attack: number; hold: number; floor: number; tail: number; tremble?: { rate: number; depth: number } }

/**
 * Read a layer's loudness-over-time off an envelope (one value per `hop`
 * seconds, the first at `t0`): where it begins, how fast it arrives, how
 * long it holds, how far it has fallen by the end.
 *
 * The layer covers the WHOLE stretch in which its part of the sound is
 * heard, first moment to last, not just the stretch around its loudest
 * instant: a creak is a run of small cracks with quiet between them, and
 * read around its one loudest crack it came out as a single late tick (the
 * wooden lid, first try). "Full" is judged against the level the sound
 * spends its time near (its 90th percentile), not one stray spike.
 */
function shapeOf(env: number[], hop: number, t0: number, smear: number, natural = 0): Shape | null {
  const peak = Math.max(0, ...env);
  if (!(peak > 0)) return null;
  const on = env.findIndex(v => v > peak * 0.1);
  let off = env.length - 1;
  while (off > on && env[off] <= peak * 0.06) off--;
  const heard = env.slice(on, off + 1).sort((p, q) => p - q);
  const full = heard[Math.min(heard.length - 1, Math.floor(heard.length * 0.9))] * 0.7;
  let up = on;
  while (up < off && env[up] < full) up++;
  let down = off;
  while (down > up && env[down] < full) down--;
  const start = Math.max(0, t0 + on * hop);
  const length = Math.max(0.03, (off - on + 1) * hop);
  // The measuring window blurs a sudden start over `smear` seconds: anything
  // that arrives within it is taken for an impact.
  const rise = (up - on) * hop;
  const attack = rise <= smear ? 0.003 : Math.min(rise, length * 0.8);
  const tail = Math.min(0.08, Math.max(0.005, length * 0.15));
  const hold = Math.max(0, Math.min((down - up) * hop, length - attack - tail));
  const nearEnd = Math.max(down, Math.min(off, Math.round(off - tail / hop)));
  const floor = Math.max(0.01, Math.min(1, env[nearEnd] / (full / 0.7)));
  // Rough or smooth? While it is sounding at full, how far does the loudness
  // stray from its average (as a share of it), and how often does it cross
  // that average on the way up? Enough of both is a tremble.
  let tremble: Shape['tremble'];
  const steady = env.slice(up, down + 1);
  if (steady.length >= 24) {
    const mean = steady.reduce((s, v) => s + v, 0) / steady.length;
    const spread = Math.sqrt(steady.reduce((s, v) => s + (v - mean) * (v - mean), 0) / steady.length) / mean;
    let crossings = 0;
    for (let i = 1; i < steady.length; i++) if (steady[i - 1] < mean && steady[i] >= mean) crossings++;
    const rate = Math.max(4, Math.min(60, Math.round(crossings / (steady.length * hop))));
    // Noise in a narrow band jumps about by itself, and the layer made for
    // it will too: only the roughness BEYOND that (`natural`) is the sound's own.
    const extra = Math.sqrt(Math.max(0, spread * spread - natural * natural));
    if (extra > 0.3 && crossings >= 3) {
      // The renderer's tremble is slowed noise times a depth: this is the
      // depth that gives that spread at that speed (capped at the slider's 30).
      const perUnit = 0.577 * Math.sqrt((1.1 * rate) / 22050);
      tremble = { rate, depth: Math.max(1, Math.min(30, Math.round(extra / perUnit))) };
    }
  }
  return { start, length, attack, hold, floor, tail, ...(tremble ? { tremble } : {}) };
}

const round = (value: number, places: number): number => {
  const k = Math.pow(10, places);
  return Math.round(value * k) / k;
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteLabel(hz: number): string {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

// ---- the sketch ------------------------------------------------------------------

/** Make the sketch, or null when there is nothing to hear in the recording. */
export function sketchFromRecording(samples: Float32Array, sampleRate: number): RecordingSketch | null {
  // 1. Trim the silence: keep from the first moment above a thirtieth of the
  //    loudest, to the last.
  const hop = Math.max(1, Math.round(sampleRate * 0.004));
  const loud: number[] = [];
  for (let at = 0; at + hop <= samples.length; at += hop) {
    let sum = 0;
    const end = Math.min(samples.length, at + 2 * hop);
    for (let i = at; i < end; i++) sum += samples[i] * samples[i];
    loud.push(Math.sqrt(sum / (end - at)));
  }
  const top = Math.max(0, ...loud);
  if (!(top > 1e-4)) return null;
  const first = loud.findIndex(v => v > top / 30);
  let last = loud.length - 1;
  while (last > first && loud[last] <= top / 30) last--;
  const from = Math.max(0, first * hop - Math.round(sampleRate * 0.005));
  const heardEnd = Math.min(samples.length, (last + 2) * hop + Math.round(sampleRate * 0.02));
  const to = Math.min(heardEnd, from + Math.round(sampleRate * SKETCH_SECONDS));
  const x = samples.subarray(from, to);
  const seconds = x.length / sampleRate;
  if (seconds < 0.01) return null;

  // 2. The separate hits: peaks of loudness at least 90 ms apart, with a
  //    real dip between them.
  const env = loud.slice(Math.floor(from / hop), Math.ceil(to / hop));
  const smooth = env.map((v, i) => (v + (env[i - 1] ?? v) + (env[i + 1] ?? v)) / 3);
  const envTop = Math.max(...smooth);
  const gap = Math.round(0.09 / 0.004);
  const peaks: number[] = [];
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i] < envTop * 0.25) continue;
    let isPeak = true;
    for (let k = Math.max(0, i - gap); k <= Math.min(smooth.length - 1, i + gap) && isPeak; k++) {
      if (smooth[k] > smooth[i] || (smooth[k] === smooth[i] && k < i)) isPeak = false;
    }
    if (!isPeak) continue;
    const before = peaks[peaks.length - 1];
    if (before !== undefined) {
      let dip = Infinity;
      for (let k = before; k <= i; k++) dip = Math.min(dip, smooth[k]);
      if (dip > Math.min(smooth[before], smooth[i]) * 0.4) {
        // No real dip: one swelling sound. Keep the higher peak.
        if (smooth[i] > smooth[before]) peaks[peaks.length - 1] = i;
        continue;
      }
    }
    peaks.push(i);
  }
  const runTogether = peaks.length > MAX_HITS;
  const hitPeaks = runTogether || peaks.length === 0 ? [peaks[0] ?? 0] : peaks;
  // Each hit runs from the dip before it to the dip before the next.
  const bounds: Array<[number, number]> = hitPeaks.map((p, h) => {
    const dipBefore = (a: number, b: number) => {
      let at = a;
      for (let k = a; k <= b; k++) if (smooth[k] < smooth[at]) at = k;
      return at;
    };
    const a = h === 0 || runTogether ? 0 : dipBefore(hitPeaks[h - 1], p);
    const b = h === hitPeaks.length - 1 || runTogether ? smooth.length : dipBefore(p, hitPeaks[h + 1]);
    return [Math.min(x.length, a * hop), Math.min(x.length, b * hop)];
  });

  // 3-5. In each hit: the notes, then the noise bands, each with its shape.
  const N = 1024;
  const H = 256;
  const binHz = sampleRate / N;
  const found: Array<SketchLayer & { energy: number }> = [];
  bounds.forEach(([a, b], h) => {
    if (b - a < 16) return;
    const prefix = hitPeaks.length > 1 ? `${h + 1} · ` : '';
    const idPrefix = hitPeaks.length > 1 ? `hit${h + 1}-` : '';
    const frames = spectrogram(x, a, b, N, H);
    const frameTime = (k: number) => (a - N / 2 + k * H + N / 2) / sampleRate; // the frame's middle
    const totals = frames.map(f => f.reduce((s, v) => s + v, 0));
    const totalTop = Math.max(...totals);
    const active = totals.map(v => v > totalTop * 0.05);
    const activeCount = active.filter(Boolean).length || 1;

    // -- notes: a pitch standing clear of its neighbourhood, and lasting.
    // Looked for in a FINE spectrum (11 Hz a step). The first cut looked in
    // the coarse one used for timing (43 Hz a step) and asked for 10 dB of
    // clearance: struck metal, whose ring is half a dozen close pitches each
    // only 10-14 dB clear even in a fine look, got NO notes at all, and its
    // ring came out as hiss (the user's sword-on-armour, 2026-11-17: "it is
    // missing some of the metallic highs"; the loudness up there was right,
    // the kind of sound was wrong).
    const FINE = 4096;
    const fineHz = sampleRate / FINE;
    const mean = new Float64Array(FINE / 2);
    let looks = 0;
    for (let at = a - FINE / 2; at < b; at += FINE / 4) {
      const power = framePower(x, Math.round(at), FINE, a, b);
      for (let i = 0; i < FINE / 2; i++) mean[i] += power[i];
      looks++;
    }
    const meanTotal = mean.reduce((s, v) => s + v, 0);
    const clear = looks >= 8 ? 6.3 : looks >= 4 ? 10 : 25; // 8 dB with plenty of looks; stricter with few
    const candidates: Array<{ bin: number; power: number }> = [];
    // From 55 Hz up: below that a "note" is a thump nobody hears as a pitch, and it
    // would take a place from a ringing one (it did, in the sword-on-armour).
    for (let i = Math.max(4, Math.ceil(55 / fineHz)); i < Math.min(FINE / 2 - 4, Math.floor(8000 / fineHz)); i++) {
      let isTop = true;
      for (let j = i - 3; j <= i + 3 && isTop; j++) if (j !== i && mean[j] > mean[i]) isTop = false;
      if (!isTop) continue;
      const reach = Math.max(30, Math.round(i * 0.15));
      const around: number[] = [];
      for (let j = Math.max(1, i - reach); j <= Math.min(FINE / 2 - 1, i + reach); j++) if (Math.abs(j - i) > 5) around.push(mean[j]);
      const power = mean[i - 2] + mean[i - 1] + mean[i] + mean[i + 1] + mean[i + 2];
      if (mean[i] < clear * median(around) || power < meanTotal * 0.007) continue;
      // Does it LAST? Clear of its neighbours in the timing frames for 70 ms,
      // or for half the time the hit is sounding if that is shorter.
      const c = Math.max(2, Math.min(N / 2 - 3, Math.round((i * fineHz) / binHz)));
      let present = 0;
      frames.forEach((f, k) => {
        if (!active[k]) return;
        const near: number[] = [];
        for (let j = Math.max(1, c - 20); j <= Math.min(N / 2 - 1, c + 20); j++) if (Math.abs(j - c) > 2) near.push(f[j]);
        if (Math.max(f[c - 1], f[c], f[c + 1]) > 4 * median(near)) present++;
      });
      if (present >= Math.min(12, activeCount * 0.5)) candidates.push({ bin: i, power });
    }
    candidates.sort((p, q) => q.power - p.power);
    const notes: Array<{ hz: number; lo: number; hi: number }> = [];
    for (const c of candidates) {
      if (notes.length >= MAX_NOTES_PER_HIT) break;
      // Its pitch, finer than one bin: where the top of the bump really is.
      const l = Math.log(mean[c.bin - 1] + 1e-30);
      const m = Math.log(mean[c.bin] + 1e-30);
      const r = Math.log(mean[c.bin + 1] + 1e-30);
      const shift = l - 2 * m + r !== 0 ? (0.5 * (l - r)) / (l - 2 * m + r) : 0;
      const hz = (c.bin + Math.max(-0.5, Math.min(0.5, shift))) * fineHz;
      if (notes.some(n => Math.abs(Math.log(n.hz / hz)) < 0.06)) continue;
      const half = Math.max(2 * binHz, hz * 0.04);
      notes.push({ hz, lo: hz - half, hi: hz + half });
    }
    const noteBins = new Set<number>();
    for (const n of notes) for (let j = Math.floor(n.lo / binHz); j <= Math.ceil(n.hi / binHz); j++) noteBins.add(j);

    const t0 = frameTime(0);
    const hopS = H / sampleRate;
    const smear = (N / sampleRate) * 0.75;

    notes.forEach((n, i) => {
      const loBin = Math.max(1, Math.floor(n.lo / binHz));
      const hiBin = Math.min(N / 2 - 1, Math.ceil(n.hi / binHz));
      const noteEnv = frames.map(f => { let s = 0; for (let j = loBin; j <= hiBin; j++) s += f[j]; return Math.sqrt(s); });
      const shape = shapeOf(noteEnv, hopS, t0, smear);
      if (!shape) return;
      // Does the pitch move? Compare where the bump sits early and late.
      const strong = noteEnv.map((v, k) => (v > Math.max(...noteEnv) * 0.3 ? k : -1)).filter(k => k >= 0);
      const centre = (k: number) => { let num = 0; let den = 0; for (let j = loBin; j <= hiBin; j++) { num += j * frames[k][j]; den += frames[k][j]; } return den > 0 ? (num / den) * binHz : n.hz; };
      const third = Math.max(1, Math.floor(strong.length / 3));
      const early = median(strong.slice(0, third).map(centre));
      const late = median(strong.slice(-third).map(centre));
      const moves = strong.length >= 6 && Math.abs(Math.log(late / early)) > 0.02;
      const fromHz = moves ? n.hz * (early / ((early + late) / 2)) : n.hz;
      const toHz = moves ? n.hz * (late / ((early + late) / 2)) : n.hz;
      const start = Math.min(2, shape.start);
      const length = Math.min(SKETCH_SECONDS, shape.length);
      found.push({
        kind: 'note',
        band: [n.lo, n.hi],
        target: bandRms(x, sampleRate, start, start + length, n.lo, n.hi),
        energy: noteEnv.reduce((s, v) => s + v * v, 0),
        layer: {
          id: `${idPrefix}note${i + 1}`,
          name: `${prefix}Note ${noteLabel(n.hz)} (${Math.round(n.hz)} Hz)`,
          source: 'tone', wave: 'sine',
          start: round(start, 3), length: round(length, 3), level: 1,
          attack: round(shape.attack, 3), hold: round(shape.hold, 3), floor: round(shape.floor, 3), tail: round(shape.tail, 3),
          pitch: { from: round(Math.max(30, Math.min(8000, fromHz)), 1), to: round(Math.max(30, Math.min(8000, toHz)), 1) },
          ...(shape.tremble ? { tremble: { ...shape.tremble, seed: round(0.21 + 0.17 * found.length, 2) } } : {}),
        },
      });
    });

    // -- noise: what is left, band by band
    NOISE_BANDS.forEach((bandDef, i) => {
      const loBin = Math.max(1, Math.ceil(bandDef.lo / binHz));
      const hiBin = Math.min(N / 2 - 1, Math.floor(bandDef.hi / binHz));
      if (hiBin < loBin) return;
      const bandEnv = frames.map(f => { let s = 0; for (let j = loBin; j <= hiBin; j++) if (!noteBins.has(j)) s += f[j]; return Math.sqrt(s); });
      const energy = bandEnv.reduce((s, v) => s + v * v, 0);
      // (How much a band of plain noise this wide strays by itself.)
      const shape = shapeOf(bandEnv, hopS, t0, smear, 0.6 / Math.sqrt(hiBin - loBin + 1));
      if (!shape) return;
      const start = Math.min(2, shape.start);
      const length = Math.min(SKETCH_SECONDS, shape.length);
      // How loud the band was, less the notes sitting in it.
      const all = bandRms(x, sampleRate, start, start + length, bandDef.lo, bandDef.hi);
      let rest = all * all;
      for (const n of notes) {
        if (n.hz < bandDef.lo || n.hz >= bandDef.hi) continue;
        const note = bandRms(x, sampleRate, start, start + length, n.lo, n.hi);
        rest -= note * note;
      }
      // A band that is nearly all note has no noise worth a layer of its own.
      if (rest < all * all * 0.03) return;
      const target = Math.sqrt(rest);
      const filters: FilterStage[] = [];
      if (i > 0) filters.push({ type: 'highpass', cutoff: { from: bandDef.lo, to: bandDef.lo } });
      if (i < NOISE_BANDS.length - 1) filters.push({ type: 'lowpass', cutoff: { from: bandDef.hi, to: bandDef.hi } });
      found.push({
        kind: bandDef.id,
        band: [bandDef.lo, bandDef.hi],
        target,
        energy,
        layer: {
          id: `${idPrefix}${bandDef.id}`,
          name: `${prefix}${bandDef.name}`,
          source: 'noise',
          start: round(start, 3), length: round(length, 3), level: 1,
          attack: round(shape.attack, 3), hold: round(shape.hold, 3), floor: round(shape.floor, 3), tail: round(shape.tail, 3),
          noiseSeed: round(0.13 + 0.29 * found.length, 2),
          ...(bandDef.slow ? { noiseRate: 0.25 } : {}),
          filters,
          ...(shape.tremble ? { tremble: { ...shape.tremble, seed: round(0.21 + 0.17 * found.length, 2) } } : {}),
        },
      });
    });
  });

  // Keep what matters: nothing more than 24 dB under the strongest part, and
  // at most MAX_LAYERS, the strongest first; then back in time order.
  const strongest = Math.max(0, ...found.map(f => f.target));
  const kept = found
    .filter(f => f.target > strongest / 16 && f.target > 0)
    .sort((p, q) => q.target - p.target)
    .slice(0, MAX_LAYERS)
    .sort((p, q) => p.layer.start - q.layer.start || p.band[0] - q.band[0]);
  if (kept.length === 0) return null;

  return {
    seconds,
    heardSeconds: (heardEnd - from) / sampleRate,
    hits: runTogether ? 1 : hitPeaks.length,
    runTogether,
    loudness: loudest50ms(x, sampleRate),
    layers: kept.map(({ layer, band, target, kind }) => ({ layer, band, target, kind })),
  };
}
