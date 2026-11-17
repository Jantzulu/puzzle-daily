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
//   3. Find the NOTES by FOLLOWING each clear pitch through time, from the
//      moment it appears to the moment it is gone. Each becomes a tone layer
//      with its own start, length and slide. Pitches that begin together
//      and are whole multiples of the lowest are ONE note with overtones
//      (a plucked string, a horn); pitches that are not (the ring of struck
//      metal) stay separate layers.
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

import { MAX_HARMONICS, type FilterStage, type SynthLayer } from './types';

/** The longest stretch that is used (s): a layer can start up to 2 s in and last 3. */
export const SKETCH_SECONDS = 3;
/** No more separate hits than this; a longer run is one continuous sound. */
const MAX_HITS = 3;
const MAX_NOTES = 12;
const MAX_LAYERS = 16;

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
  /** Where this part of the sound lives (Hz): one stretch of the spectrum, or one per overtone. */
  bands: ReadonlyArray<readonly [number, number]>;
  /** How loud THIS PART was in the recording over the layer's own stretch (RMS, in sample units). */
  target: number;
  /** How loud everything in those bands was over that stretch: what the finished mix should reach there. */
  mixTarget: number;
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

/** The same, over several stretches of the spectrum at once. */
export function bandsRms(x: Float32Array, sampleRate: number, t0: number, t1: number, bands: ReadonlyArray<readonly [number, number]>): number {
  let sum = 0;
  for (const [lo, hi] of bands) {
    const one = bandRms(x, sampleRate, t0, t1, lo, hi);
    sum += one * one;
  }
  return Math.sqrt(sum);
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

  // 3. The notes, followed through time.
  const { notes, pitchesAt } = followNotes(x, sampleRate);
  const found: SketchLayer[] = [];
  notes.forEach((note, i) => {
    const start = Math.min(2, note.shape.start);
    const length = Math.min(SKETCH_SECONDS, note.shape.length);
    const target = bandsRms(x, sampleRate, start, start + length, note.bands);
    const steady = note.from === note.to;
    found.push({
      kind: 'note',
      bands: note.bands,
      target,
      mixTarget: target,
      layer: {
        id: `note${i + 1}`,
        name: `Note ${noteLabel(steady ? note.from : Math.sqrt(note.from * note.to))} (${Math.round(note.from)}${steady ? '' : `-${Math.round(note.to)}`} Hz)`,
        source: 'tone', wave: 'sine',
        start: round(start, 3), length: round(length, 3), level: 1,
        attack: round(note.shape.attack, 3), hold: round(note.shape.hold, 3), floor: round(note.shape.floor, 3), tail: round(note.shape.tail, 3),
        pitch: {
          from: round(note.from, 1),
          to: round(note.to, 1),
          ...(note.via !== undefined ? { via: { value: round(note.via, 1), at: round(length / 2, 3) } } : {}),
        },
        ...(note.harmonics.length > 0 ? { harmonics: note.harmonics } : {}),
        ...(note.shape.tremble ? { tremble: { ...note.shape.tremble, seed: round(0.21 + 0.17 * i, 2) } } : {}),
      },
    });
  });

  // 4-6. In each hit: what is left once the notes are taken out, band by band.
  const N = 1024;
  const H = 256;
  const binHz = sampleRate / N;
  let windowSum = 0;
  for (const v of hann(N)) windowSum += v * v;
  bounds.forEach(([a, b], h) => {
    if (b - a < 16) return;
    const prefix = hitPeaks.length > 1 ? `${h + 1} · ` : '';
    const idPrefix = hitPeaks.length > 1 ? `hit${h + 1}-` : '';
    const frames = spectrogram(x, a, b, N, H);
    const t0 = a / sampleRate; // the first frame's middle
    const hopS = H / sampleRate;
    // A sudden start, seen through the measuring window, takes about this long to arrive.
    const smear = (N / sampleRate) * 0.45;
    // Which bins a note is sitting in, frame by frame.
    const noteBins = frames.map((_, j) => {
      const taken = new Set<number>();
      const when = (a + j * H) / sampleRate;
      for (const hz of pitchesAt(when)) {
        const c = Math.round(hz / binHz);
        for (let d = -2; d <= 2; d++) taken.add(c + d);
      }
      return taken;
    });
    NOISE_BANDS.forEach((bandDef, i) => {
      const loBin = Math.max(1, Math.ceil(bandDef.lo / binHz));
      const hiBin = Math.min(N / 2 - 1, Math.floor(bandDef.hi / binHz));
      if (hiBin < loBin) return;
      const rest = frames.map((frame, j) => { let s = 0; for (let k = loBin; k <= hiBin; k++) if (!noteBins[j].has(k)) s += frame[k]; return s; });
      // (How much a band of plain noise this wide strays by itself.)
      const shape = shapeOf(rest.map(Math.sqrt), hopS, t0, smear, 0.6 / Math.sqrt(hiBin - loBin + 1));
      if (!shape) return;
      const start = Math.min(2, shape.start);
      const length = Math.min(SKETCH_SECONDS, shape.length);
      // How loud the band's own noise was over that stretch (measured as
      // bandRms measures), and how loud the band was with everything in it.
      const j0 = Math.max(0, Math.round((start - t0) / hopS));
      const j1 = Math.min(rest.length, Math.max(j0 + 1, Math.round((start + length - t0) / hopS)));
      let sum = 0;
      for (let j = j0; j < j1; j++) sum += rest[j];
      const target = Math.sqrt((2 * sum) / ((j1 - j0) * N * windowSum));
      const mixTarget = Math.max(target, bandRms(x, sampleRate, start, start + length, bandDef.lo, bandDef.hi));
      // A band that is nearly all note has no noise worth a layer of its own.
      if (target * target < mixTarget * mixTarget * 0.03) return;
      const filters: FilterStage[] = [];
      if (i > 0) filters.push({ type: 'highpass', cutoff: { from: bandDef.lo, to: bandDef.lo } });
      if (i < NOISE_BANDS.length - 1) filters.push({ type: 'lowpass', cutoff: { from: bandDef.hi, to: bandDef.hi } });
      found.push({
        kind: bandDef.id,
        bands: [[bandDef.lo, bandDef.hi]],
        target,
        mixTarget,
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
  const strongest = Math.max(0, ...found.map(part => part.target));
  const kept = found
    .filter(part => part.target > strongest / 16 && part.target > 0)
    .sort((p, q) => q.target - p.target)
    .slice(0, MAX_LAYERS)
    .sort((p, q) => p.layer.start - q.layer.start || p.bands[0][0] - q.bands[0][0]);
  if (kept.length === 0) return null;

  return {
    seconds,
    heardSeconds: (heardEnd - from) / sampleRate,
    hits: runTogether ? 1 : hitPeaks.length,
    runTogether,
    loudness: loudest50ms(x, sampleRate),
    layers: kept,
  };
}

// ---- following the notes through time ------------------------------------------------
//
// HOW (and why it replaced a simpler way). The first cut took one long look
// at each hit and called every clear peak in it a note sounding for the
// whole hit. That is right for one struck thing, and wrong for anything
// that plays notes ONE AFTER ANOTHER: three clips the user sent to tune
// this against (a rising run of bells, a harpsichord phrase, a thump that
// leaves one long tone ringing; 2026-11-17) all came out as a chord held
// from start to finish.
// So: look every 6 ms; in each look take the pitches standing clear of
// what is around them; join each to the pitch it continues from the look
// before (within 3%, which also follows a slide). What comes out is a set
// of TRACKS, each one pitch from the moment it appears to the moment it is
// gone. A track that is short, patchy, weak or never very clear is dropped:
// noise throws up clear peaks too, but not in one place for a tenth of a
// second.

const TRACK_N = 2048;
const TRACK_HOP = 256;

interface Track { frames: number[]; hz: number[]; amp: number[]; clear: number[] }

interface FoundNote {
  shape: Shape;
  from: number;
  to: number;
  /** The pitch half-way, when the slide is not a straight one. */
  via?: number;
  harmonics: Array<{ ratio: number; level: number }>;
  bands: Array<readonly [number, number]>;
  energy: number;
}

interface Partial {
  start: number; // frame
  end: number;
  hz: number[]; // one per frame from start to end
  amp: number[];
  energy: number;
  peak: number;
  mean: number;
  /** How long a sudden start takes to show through the window this was seen with (s). */
  smear: number;
}

/**
 * Follow the pitches between `loHz` and `hiHz`, looking through a window
 * of `n` samples. Returns the ones good enough to be notes.
 */
function followPitches(x: Float32Array, sampleRate: number, n: number, loHz: number, hiHz: number): Partial[] {
  const hzPerBin = sampleRate / n;
  const lowBin = Math.max(4, Math.ceil(loHz / hzPerBin));
  const highBin = Math.min(n / 2 - 4, Math.floor(hiHz / hzPerBin));
  const frames = spectrogram(x, 0, x.length, n, TRACK_HOP);
  const totals = frames.map(frame => { let s = 0; for (let i = 1; i < frame.length; i++) s += frame[i]; return s; });
  const loudest = Math.max(0, ...totals);
  const everything = totals.reduce((s, v) => s + v, 0);
  if (!(loudest > 0)) return [];
  // A steady tone of amplitude A shows as this much power in its three bins.
  const toAmplitude = (power: number) => (Math.sqrt(power / 1.5) * 4) / n;

  const open: Track[] = [];
  const closed: Track[] = [];
  frames.forEach((frame, k) => {
    const peaks: Array<{ hz: number; amp: number; clear: number }> = [];
    if (totals[k] > loudest * 0.0005) {
      for (let i = lowBin; i < highBin; i++) {
        if (!(frame[i] > frame[i - 1] && frame[i] >= frame[i + 1] && frame[i] > frame[i - 2] && frame[i] >= frame[i + 2])) continue;
        const power = frame[i - 1] + frame[i] + frame[i + 1];
        if (power < totals[k] * 0.003) continue;
        const reach = Math.max(16, Math.round(i * 0.12));
        const around: number[] = [];
        for (let j = Math.max(1, i - reach); j <= Math.min(n / 2 - 1, i + reach); j++) if (Math.abs(j - i) > 3) around.push(frame[j]);
        const clear = frame[i] / (median(around) + 1e-30);
        if (clear < 5) continue;
        // Its pitch, finer than one bin: where the top of the bump really is.
        const l = Math.log(frame[i - 1] + 1e-30);
        const m = Math.log(frame[i] + 1e-30);
        const r = Math.log(frame[i + 1] + 1e-30);
        const shift = l - 2 * m + r !== 0 ? (0.5 * (l - r)) / (l - 2 * m + r) : 0;
        peaks.push({ hz: (i + Math.max(-0.5, Math.min(0.5, shift))) * hzPerBin, amp: toAmplitude(power), clear });
      }
      peaks.sort((p, q) => q.amp - p.amp);
      peaks.length = Math.min(peaks.length, 16);
    }
    // Where each open track is: the middle of its last few looks (one wild
    // reading must not throw it off its pitch).
    const where = new Map<Track, number>();
    for (const track of open) where.set(track, median(track.hz.slice(-5)));
    const taken = new Set<Track>();
    for (const peak of peaks) {
      let best: Track | null = null;
      let off = 0.03;
      let shadowed = false;
      for (const track of open) {
        const d = Math.abs(Math.log(peak.hz / where.get(track)!));
        if (d >= 0.03) continue;
        if (taken.has(track)) { shadowed = true; continue; }
        if (d < off) { best = track; off = d; }
      }
      if (!best) {
        // A second bump beside a pitch already being followed (a tone that
        // beats or wavers shows two) is that same pitch, not a new note.
        if (shadowed) continue;
        best = { frames: [], hz: [], amp: [], clear: [] };
        open.push(best);
        where.set(best, peak.hz);
      }
      taken.add(best);
      best.frames.push(k); best.hz.push(peak.hz); best.amp.push(peak.amp); best.clear.push(peak.clear);
    }
    // A pitch not seen for six looks (35 ms) has stopped.
    for (let i = open.length - 1; i >= 0; i--) {
      const track = open[i];
      if (k - track.frames[track.frames.length - 1] > 6) { closed.push(track); open.splice(i, 1); }
    }
  });
  closed.push(...open);

  // The same pitch picked up again a moment later is one note, not two.
  closed.sort((p, q) => p.frames[0] - q.frames[0]);
  for (let i = 0; i < closed.length; i++) {
    for (let j = i + 1; j < closed.length; j++) {
      const a = closed[i];
      const b = closed[j];
      const gap = b.frames[0] - a.frames[a.frames.length - 1];
      if (gap <= 0 || gap > 20) continue; // up to 116 ms apart
      if (Math.abs(Math.log(median(b.hz.slice(0, 8)) / median(a.hz.slice(-8)))) > 0.025) continue;
      a.frames.push(...b.frames); a.hz.push(...b.hz); a.amp.push(...b.amp); a.clear.push(...b.clear);
      closed.splice(j, 1);
      j--;
    }
  }

  // Keep the tracks that are really notes; fill the looks each one missed.
  const partials: Partial[] = [];
  for (const track of closed) {
    const start = track.frames[0];
    const end = track.frames[track.frames.length - 1];
    const span = end - start + 1;
    // Long enough (two windows: looks 6 ms apart through a 93 ms window are
    // nearly the same look, so one window's length proves nothing), seen in
    // most of its looks, clear, and not tiny.
    const longEnough = Math.max(16, Math.round((2 * n) / TRACK_HOP));
    const clear = median(track.clear);
    if (span < longEnough || track.frames.length < 14 || track.frames.length < span * 0.45 || clear < 8) continue;
    // A NOTE, OR A RUMBLE WITH A FAVOURITE PITCH? A winch's rumble keeps
    // exciting the same few resonances, and they follow like notes do: as
    // long, as clear (9-14 dB) and as steady as the ringing pitches of a
    // struck gate. Told apart by ear the answer was plain (as steady notes
    // the winch was "an electric motor"; as noise it was right). What
    // differs is the shape: a struck thing is loudest at once and dies
    // away; a resonance fed by noise comes and goes for as long as the
    // noise does. So a pitch is a note if it is UNMISTAKABLE (17 dB clear:
    // an instrument, a synthesised tone, a whistle), or if it is STRUCK
    // (loudest in its first third, well down by its end). Anything else
    // stays in the noise, where its band's tremble carries it.
    if (clear < 50) {
      let top = 0;
      for (let i = 1; i < track.amp.length; i++) if (track.amp[i] > track.amp[top]) top = i;
      const ending = median(track.amp.slice(-Math.max(2, Math.round(track.amp.length * 0.15))));
      const struck = track.frames[top] - start <= span * 0.35 && ending <= track.amp[top] * 0.4;
      if (!struck) continue;
    }
    const energy = track.amp.reduce((s, v) => s + v * v, 0);
    // (Its share of the sound, in the units the looks were taken in.)
    const share = track.amp.reduce((s, v) => s + 1.5 * ((v * n) / 4) * ((v * n) / 4), 0) / everything;
    if (share < 0.004) continue;
    const hz: number[] = [];
    const amp: number[] = [];
    let at = 0;
    for (let k = start; k <= end; k++) {
      if (track.frames[at + 1] !== undefined && track.frames[at + 1] <= k) at++;
      hz.push(track.hz[at]);
      amp.push(track.frames[at] === k ? track.amp[at] : track.amp[at] * 0.35); // a look that missed it: it was faint there
    }
    partials.push({ start, end, hz, amp, energy, peak: Math.max(...amp), mean: median(hz), smear: (n / sampleRate) * 0.45 });
  }
  return partials;
}

/**
 * How long the pitch `hz` takes to ARRIVE around `at` seconds (from a tenth
 * of its level there to most of it), measured with a window only three of
 * its cycles long. The windows that find and follow a note are far too long
 * to say whether it was struck or swelled in: through them a 50 ms fade-in
 * and a pluck look the same.
 */
function arrival(x: Float32Array, sampleRate: number, hz: number, at: number): number {
  const size = Math.max(256, Math.round((3 / hz) * sampleRate));
  const step = Math.max(32, Math.round(size / 4));
  const first = Math.max(0, Math.round((at - 0.08) * sampleRate));
  const last = Math.min(x.length - size, Math.round((at + 0.25) * sampleRate));
  const turn = (2 * Math.PI * hz) / sampleRate;
  const levels: number[] = [];
  for (let s = first; s <= last; s += step) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < size; i++) {
      const v = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
      re += v * Math.cos(turn * i);
      im -= v * Math.sin(turn * i);
    }
    levels.push(Math.sqrt(re * re + im * im));
  }
  const top = Math.max(0, ...levels);
  if (!(top > 0)) return 0.003;
  const up = levels.findIndex(v => v >= top * 0.7);
  let on = up;
  while (on > 0 && levels[on - 1] > top * 0.1) on--;
  const rise = ((up - on) * step) / sampleRate;
  // Anything quicker than the window can see is a strike.
  return rise <= (size * 0.45 + step) / sampleRate ? 0.003 : rise;
}

function followNotes(x: Float32Array, sampleRate: number): { notes: FoundNote[]; pitchesAt: (seconds: number) => number[] } {
  // TWO LOOKS, because no one window suits every pitch. Low notes need a
  // long window to be told apart at all (at 46 ms a harpsichord's low
  // strings, 86 Hz apart with overtones every 86 Hz, ran together and never
  // stood "clear": they came out as rumble). High ones need a short one to
  // be timed (a rising run of bells is a new note every tenth of a second).
  const partials = [
    ...followPitches(x, sampleRate, TRACK_N * 2, 55, 700),
    ...followPitches(x, sampleRate, TRACK_N, 700, 8000),
  ];

  // Every pitch good enough to be a note is left out of the noise, WHETHER
  // OR NOT it ends up kept as one (there is room for twelve): a clear pitch
  // must never come back as hiss. First try, only the kept notes were left
  // out, and a harpsichord's unkept overtones came out as five long bands
  // of noise. A pitch that is NOT good enough (a dull thump, a flicker)
  // stays in the noise, where it belongs: second try, those were left out
  // too, and a low thump that was a third of a sound vanished from it.
  const everyPitch = [...partials];
  const pitchesAt = (seconds: number): number[] => {
    const k = Math.round(seconds / (TRACK_HOP / sampleRate));
    const now: number[] = [];
    for (const p of everyPitch) if (k >= p.start && k <= p.end) now.push(p.hz[k - p.start]);
    return now;
  };

  // Pitches that begin together and are whole multiples of the lowest are
  // one note and its overtones.
  partials.sort((p, q) => p.mean - q.mean);
  const used = new Set<Partial>();
  const groups: Partial[][] = [];
  for (const low of partials) {
    if (used.has(low)) continue;
    used.add(low);
    const group = [low];
    for (const high of partials) {
      if (used.has(high) || high.mean <= low.mean) continue;
      if (Math.abs(high.start - low.start) > 8) continue; // within 46 ms (the two looks time a start a little differently)
      const shared = Math.min(high.end, low.end) - Math.max(high.start, low.start) + 1;
      if (shared < Math.min(high.end - high.start, low.end - low.start) * 0.5) continue;
      const ratio = high.mean / low.mean;
      const whole = Math.round(ratio);
      if (whole < 2 || whole > 12 || Math.abs(ratio - whole) > 0.02 * whole) continue;
      used.add(high);
      group.push(high);
    }
    groups.push(group);
  }

  const hop = TRACK_HOP / sampleRate;
  const found: FoundNote[] = [];
  for (const group of groups) {
    // The note's own pitch is the lowest of the group, unless that one is
    // much the weakest (then the strongest leads, and the rest are told
    // from it).
    const strongest = group.reduce((p, q) => (q.peak > p.peak ? q : p));
    const main = group[0].peak >= strongest.peak / 1.2 ? group[0] : strongest;
    const others = group.filter(p => p !== main).sort((p, q) => q.peak - p.peak).slice(0, MAX_HARMONICS);
    const shape = shapeOf(main.amp, hop, main.start * hop, main.smear, 0.2);
    if (!shape) continue;
    shape.attack = Math.min(arrival(x, sampleRate, main.hz[0], shape.start), shape.length * 0.8);
    shape.hold = Math.max(0, Math.min(shape.hold, shape.length - shape.attack - shape.tail));
    const third = Math.max(1, Math.floor(main.hz.length / 3));
    const early = median(main.hz.slice(0, third));
    const late = median(main.hz.slice(-third));
    const middle = median(main.hz.slice(third, Math.max(third + 1, main.hz.length - third)));
    const moves = Math.abs(Math.log(late / early)) > 0.012;
    const clampHz = (hz: number) => Math.max(30, Math.min(8000, hz));
    const from = clampHz(moves ? early : main.mean);
    const to = clampHz(moves ? late : main.mean);
    const bent = moves && Math.abs(Math.log(middle / Math.sqrt(early * late))) > 0.02;
    const members = [main, ...others];
    found.push({
      shape,
      from,
      to,
      ...(bent ? { via: clampHz(middle) } : {}),
      harmonics: others.map(p => ({ ratio: round(p.mean / main.mean, 3), level: round(Math.min(1.2, p.peak / main.peak), 2) })),
      bands: members.map(p => {
        const lo = Math.min(...p.hz);
        const hi = Math.max(...p.hz);
        const half = Math.max(30, p.mean * 0.04);
        return [Math.max(20, lo - half), hi + half] as const;
      }),
      energy: members.reduce((s, p) => s + p.energy, 0),
    });
  }
  return {
    notes: found.sort((p, q) => q.energy - p.energy).slice(0, MAX_NOTES).sort((p, q) => p.shape.start - q.shape.start),
    pitchesAt,
  };
}
