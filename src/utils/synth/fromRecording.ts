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
//      with its own start, length and slide. Pitches that begin together,
//      are whole multiples of the lowest AND rise and fall with it are ONE
//      note with overtones (a plucked string, a horn); pitches that are not
//      (the ring of struck metal, a shimmer whose pitches pulse in turn)
//      stay separate layers. When there are more notes than room, they are
//      taken evenly from across the sound, not all from its loudest part.
//   4. Everything else is NOISE, split into five fixed bands (rumble, body,
//      grit, hiss, air). Each band with enough in it becomes a noise layer,
//      UNLESS what is in it is notes there was no room to name: a sound
//      made of notes gets no noise.
//   5. Each layer's loudness over time (how fast it arrives, how long it
//      holds, how far it fades) is read off that part of the recording.
//   6. A layer whose loudness keeps jumping about while it sounds (a creak's
//      cracks, a winch's chug) is given a TREMBLE of about that speed and
//      depth. Without it a wooden creak came out as a steady hiss: right
//      in level, wrong in kind. A NOTE whose loudness beats as evenly as a
//      clock is given a PULSE instead.
// What it leaves out, on purpose: wobble, echo, pitch that wanders. Those
// are for the ear to add.
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
const MAX_NOTES = 20;
/** Of which an instrument's struck notes (each a whole stack of overtones) may be this many. */
const MAX_STRUCK = 16;
const MAX_LAYERS = 20;

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
  if (bands.length === 1) return bandRms(x, sampleRate, t0, t1, bands[0][0], bands[0][1]);
  const from = Math.max(0, Math.round(t0 * sampleRate));
  const to = Math.min(x.length, Math.round(t1 * sampleRate));
  if (to <= from) return 0;
  // One look at each frame, however many stretches are asked for; a bin
  // that two stretches share is counted once.
  const hz = sampleRate / BAND_N;
  const wanted = new Uint8Array(BAND_N / 2);
  for (const [lo, hi] of bands) {
    for (let i = Math.max(1, Math.ceil(lo / hz)); i <= Math.min(BAND_N / 2 - 1, Math.floor(hi / hz)); i++) wanted[i] = 1;
  }
  let sum = 0;
  let count = 0;
  for (let at = from - BAND_N / 2; at < to; at += BAND_N / 4) {
    const power = framePower(x, Math.round(at), BAND_N, from, to);
    for (let i = 1; i < BAND_N / 2; i++) if (wanted[i]) sum += power[i];
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

/**
 * THE FLOOR UNDER A STRETCH OF SPECTRUM: what its middle value would be if
 * it were all noise, judged from its QUIETEST quarter. In plain noise that
 * is the middle value itself (the quarter mark of noise power sits at 0.415
 * of its median). Where notes stand close together it is what lies BETWEEN
 * them, which the plain median is not: with more than half the bins inside
 * some note, the median is a note.
 */
const floorOf = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 2] / 0.415;
};

// ---- the shape of one layer --------------------------------------------------------

interface Shape {
  start: number; length: number; attack: number; hold: number; floor: number; tail: number;
  tremble?: { rate: number; depth: number };
  /** A REGULAR beat in its loudness (only looked for when asked: see shapeOf). */
  pulse?: { rate: number; depth: number };
}

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
function shapeOf(env: number[], hop: number, t0: number, smear: number, natural = 0, mayPulse = false): Shape | null {
  const peak = Math.max(0, ...env);
  if (!(peak > 0)) return null;
  const on = env.findIndex(v => v > peak * 0.1);
  let off = env.length - 1;
  while (off > on && env[off] <= peak * 0.06) off--;
  const heard = env.slice(on, off + 1).sort((p, q) => p - q);
  const full = heard[Math.min(heard.length - 1, Math.floor(heard.length * 0.9))] * 0.7;
  let up = on;
  while (up < off && env[up] < full) up++;
  // HOW FAST IT ARRIVES is read off the loudness SMOOTHED over a twentieth
  // of a second when the layer may be one that pulses: a note swelling in
  // over a quarter of a second with a tremolo on it reaches "full" at the
  // top of its first beat, and a spell that swells in came out starting at
  // full, 10 dB too loud for its first fifth of a second.
  let arrived = up;
  if (mayPulse) {
    const REACH = Math.max(1, Math.round(0.03 / hop));
    const smooth = env.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - REACH); j <= Math.min(env.length - 1, i + REACH); j++) { sum += env[j]; count++; }
      return sum / count;
    });
    const smoothHeard = smooth.slice(on, off + 1).sort((p, q) => p - q);
    const smoothFull = smoothHeard[Math.min(smoothHeard.length - 1, Math.floor(smoothHeard.length * 0.9))] * 0.7;
    arrived = on;
    while (arrived < off && smooth[arrived] < smoothFull) arrived++;
  }
  let down = off;
  while (down > up && env[down] < full) down--;
  const start = Math.max(0, t0 + on * hop);
  const length = Math.max(0.03, (off - on + 1) * hop);
  // The measuring window blurs a sudden start over `smear` seconds: anything
  // that arrives within it is taken for an impact.
  const rise = (Math.max(up, arrived) - on) * hop;
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
  // ROUGH, OR BEATING IN TIME? A note whose loudness goes up and down as
  // regularly as a clock (a synthesised tremolo, two close strings beating)
  // is a PULSE, not a tremble: a tremble is ragged, and a spell's even
  // shimmer came out as a ragged warble on every note (spell-casting, the
  // user's ear 2026-11-17). Only asked of NOTES. Never of noise: a rumble
  // given a strict beat is an electric motor (the winch, same ear).
  let pulse: Shape['pulse'];
  if (mayPulse && steady.length >= 48) {
    // What is left once the slow rise and fall is taken out (a fifth of a second's average).
    const REACH = Math.round(0.1 / hop);
    const ripple = steady.map((v, i) => {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - REACH); j <= Math.min(steady.length - 1, i + REACH); j++) { sum += steady[j]; count++; }
      return v - sum / count;
    });
    // How like itself it is, one beat later: for each length of beat from 17 ms to 0.2 s.
    const alike = (lag: number): number => {
      let both = 0;
      let first = 0;
      let second = 0;
      for (let i = 0; i + lag < ripple.length; i++) { both += ripple[i] * ripple[i + lag]; first += ripple[i] * ripple[i]; second += ripple[i + lag] * ripple[i + lag]; }
      return first > 0 && second > 0 ? both / Math.sqrt(first * second) : 0;
    };
    const longest = Math.min(Math.round(0.2 / hop), Math.floor(steady.length / 3));
    for (let lag = 3; lag <= longest; lag++) {
      const here = alike(lag);
      if (here < 0.5 || here < alike(lag - 1) || here < alike(lag + 1)) continue;
      const mean = steady.reduce((s, v) => s + v, 0) / steady.length;
      const size = Math.sqrt(ripple.reduce((s, v) => s + v * v, 0) / ripple.length) / mean;
      // (A steady wave of depth d strays from its average by d over root two.)
      const depth = Math.min(1, size * Math.SQRT2);
      if (depth >= 0.15) pulse = { rate: Math.max(1, Math.min(120, Math.round(10 / (lag * hop)) / 10)), depth: Math.round(depth * 100) / 100 };
      break; // the shortest beat that repeats is the beat
    }
  }
  return { start, length, attack, hold, floor, tail, ...(pulse ? { pulse } : tremble ? { tremble } : {}) };
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
        ...(note.shape.pulse ? { pulse: note.shape.pulse } : {}),
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
      // A band that is mostly note has no noise worth a layer of its own: the
      // little that is left would be heard as a hiss under the notes for as
      // long as they play (a harpsichord phrase, the user's ear: "this
      // overbearing hiss in the background").
      if (target * target < mixTarget * mixTarget * 0.15) return;
      // NOISE, OR NOTES WITHOUT A NAME? A sound made of nothing but notes
      // has more of them than there is room for (a sparkle of 260 small
      // bells; a spell's dozen shimmering pitches). What was left over was
      // made up in noise, to the band's full level: the loudest layer of a
      // spell was "Air", a hiss over the top of it, and a run of bells began
      // with half a second of nothing else (both clips, the user's ear
      // 2026-11-17). Right in amount, wrong in kind. So the band's FLOOR is
      // measured: what lies between the things standing up in it. In noise
      // nearly everything is floor (0.3 to 1 of the band, over the gate, the
      // winch, the armour and the rune); between notes there is next to
      // nothing (0.02 to 0.16 over the two magic clips). A band that is
      // mostly things standing up gets no noise. (Only where a band has bins
      // enough to judge by: from the grit up.)
      if (bandDef.lo >= 700) {
        const BLOCK = 21;
        let floor = 0;
        let whole = 0;
        for (let j = j0; j < j1; j++) {
          for (let k = loBin; k <= hiBin; k += BLOCK) {
            const block = Array.from(frames[j].subarray(k, Math.min(hiBin + 1, k + BLOCK)));
            const sum = block.reduce((s, v) => s + v, 0);
            whole += sum;
            // (Noise's average power is its middle value over 0.693.)
            floor += Math.min(sum, (block.length * floorOf(block)) / 0.693);
          }
        }
        if (floor < whole * 0.22) return;
      }
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
/** A pitch standing this far clear of what is around it (17 dB) is a tone beyond doubt: no noise does that. */
const UNMISTAKABLE = 50;
/**
 * GROUND: what a pitch stands on. Half an octave either side of it, how
 * much of the sound is the floor (noise) and how much stands up out of it
 * (notes)? A winch's rumble is nearly all floor, with resonances poking a
 * little out of it. A sound made of notes is nearly none: between the notes
 * there is next to nothing. Under this share of floor, a pitch is AMONG
 * NOTES, and is believed as one on being merely clear: the soft low bells
 * of a rising run stand only as far out of their neighbours as a winch's
 * resonances stand out of its rumble (12-16 dB), because their neighbours
 * are other bells.
 */
const AMONG_NOTES = 0.15;
/** Is this track a tone beyond doubt? */
const isSure = (track: Track): boolean => median(track.clear) >= UNMISTAKABLE || median(track.ground) < AMONG_NOTES;

interface Track {
  frames: number[]; hz: number[]; amp: number[]; clear: number[];
  /** Look by look: how much of the sound around it is noise (see GROUND). */
  ground: number[];
}

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
  /**
   * How much of the sound it is, MOMENT BY MOMENT: its share of each look,
   * added up, a quiet look counting for less than a loud one but not in
   * proportion (loudness as the ear takes it). See "which notes are kept".
   */
  weight: number;
}

/**
 * A SLIDE, OR A WALK FROM NOTE TO NOTE? Following a pitch within 3% keeps
 * hold of one that slides and of one that wavers (struck metal; followed
 * more tightly, a long wavering tone fell to pieces). But where notes stand
 * a few percent apart and each dies as the next is struck, a track steps
 * from one onto its neighbour, and on: a run of small bells that only RISES
 * came out as sixteen notes sliding DOWN (magic-ascend, the user's ear
 * 2026-11-17). Through the window the notes are followed with, such a walk
 * looks as smooth as a slide. Through a LONG one (186 ms) it does not: a
 * pitch that slides is never anywhere for long, and leaves an even smear
 * across the stretch it crossed; notes that stand still leave sharp peaks
 * with gaps between.
 * Returns the pitch standing in [lo, hi] Hz during [t0, t1] seconds, 0 when
 * the stretch is an even smear (a true slide), or -1 when the stretch is
 * too narrow to tell.
 */
function standingPitch(x: Float32Array, sampleRate: number, t0: number, t1: number, lo: number, hi: number): number {
  const N = 8192;
  const hz = sampleRate / N;
  const a = Math.max(2, Math.round(lo / hz));
  const b = Math.min(N / 2 - 2, Math.round(hi / hz));
  if (b - a < 5) return -1;
  const sum = new Float64Array(N / 2);
  const first = Math.round(t0 * sampleRate);
  const last = Math.max(first, Math.round(t1 * sampleRate));
  for (let centre = first; centre <= last; centre += N / 4) {
    const power = framePower(x, centre - N / 2, N, 0, x.length);
    for (let i = a - 1; i <= b + 1; i++) sum[i] += power[i];
  }
  let top = a;
  const within: number[] = [];
  for (let i = a; i <= b; i++) { within.push(sum[i]); if (sum[i] > sum[top]) top = i; }
  // (An even smear measures about 0.4 to 0.7 here; a peak over a gap, far more.)
  if (sum[top] < floorOf(within) * 1.5) return 0;
  const l = Math.log(sum[top - 1] + 1e-30);
  const m = Math.log(sum[top] + 1e-30);
  const r = Math.log(sum[top + 1] + 1e-30);
  const shift = l - 2 * m + r !== 0 ? (0.5 * (l - r)) / (l - 2 * m + r) : 0;
  return (top + Math.max(-0.5, Math.min(0.5, shift))) * hz;
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
    const peaks: Array<{ hz: number; amp: number; clear: number; ground: number }> = [];
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
        // Its ground: the sound half an octave either side, WITHOUT this pitch
        // and without the strongest other thing there. (One loud whistle over
        // a rumble must not make the rumble's resonances "among notes": with
        // it left in, a winch came out as four low notes.)
        const regionLo = Math.max(1, Math.round(i * 0.7));
        const regionHi = Math.min(n / 2 - 1, Math.round(i * 1.4));
        let other = -1;
        for (let j = regionLo; j <= regionHi; j++) if (Math.abs(j - i) > 3 && (other < 0 || frame[j] > frame[other])) other = j;
        const region: number[] = [];
        let regionSum = 0;
        for (let j = regionLo; j <= regionHi; j++) {
          if (Math.abs(j - i) <= 3 || Math.abs(j - other) <= 3) continue;
          region.push(frame[j]);
          regionSum += frame[j];
        }
        // (Noise's average power is its middle value over 0.693. Too little
        // left to judge by: not among notes.)
        const ground = region.length < 12 ? 1 : Math.min(1, (region.length * floorOf(region)) / 0.693 / (regionSum + 1e-30));
        peaks.push({ hz: (i + Math.max(-0.5, Math.min(0.5, shift))) * hzPerBin, amp: toAmplitude(power), clear, ground });
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
        best = { frames: [], hz: [], amp: [], clear: [], ground: [] };
        open.push(best);
        where.set(best, peak.hz);
      }
      taken.add(best);
      best.frames.push(k); best.hz.push(peak.hz); best.amp.push(peak.amp); best.clear.push(peak.clear); best.ground.push(peak.ground);
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
      a.frames.push(...b.frames); a.hz.push(...b.hz); a.amp.push(...b.amp); a.clear.push(...b.clear); a.ground.push(...b.ground);
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
    // an instrument, a synthesised tone, a whistle), or stands AMONG NOTES
    // (no noise around it to be a resonance of), or if it is STRUCK
    // (loudest in its first third, well down by its end). Anything else
    // stays in the noise, where its band's tremble carries it.
    if (!isSure(track)) {
      let top = 0;
      for (let i = 1; i < track.amp.length; i++) if (track.amp[i] > track.amp[top]) top = i;
      const ending = median(track.amp.slice(-Math.max(2, Math.round(track.amp.length * 0.15))));
      const struck = track.frames[top] - start <= span * 0.35 && ending <= track.amp[top] * 0.4;
      if (!struck) continue;
    }
    const energy = track.amp.reduce((s, v) => s + v * v, 0);
    // (Its share of the sound, in the units the looks were taken in.)
    const power = (v: number) => 1.5 * ((v * n) / 4) * ((v * n) / 4);
    const share = track.amp.reduce((s, v) => s + power(v), 0) / everything;
    // WHICH NOTES ARE KEPT. By its share of all the sound's energy alone, a
    // note in a quiet stretch is nothing: the soft low notes that OPEN a
    // rising run were a two-hundredth of the energy of the loud top of it,
    // and were left out, so the sketch began with half a second of nothing
    // but hiss. To the ear they are the whole sound for as long as nothing
    // else is playing. So a note is also weighed moment by moment: what
    // share of each look it is, a quiet look counting for less than a loud
    // one only as loudness is heard (the 0.3 power).
    let weight = 0;
    track.frames.forEach((k, i) => { weight += Math.min(1, power(track.amp[i]) / totals[k]) * Math.pow(totals[k] / loudest, 0.3); });
    if (share < 0.004 && (weight < 0.5 || !isSure(track))) continue;
    const hz: number[] = [];
    const amp: number[] = [];
    let at = 0;
    for (let k = start; k <= end; k++) {
      if (track.frames[at + 1] !== undefined && track.frames[at + 1] <= k) at++;
      hz.push(track.hz[at]);
      // A look that missed it: it was faint there, and gone if it has been missing a while.
      amp.push(track.frames[at] === k ? track.amp[at] : track.amp[at] * (k - track.frames[at] <= 6 ? 0.35 : 0.03));
    }
    partials.push({ start, end, hz, amp, energy, peak: Math.max(...amp), mean: median(hz), smear: (n / sampleRate) * 0.45, weight });
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

// ---- struck notes: an instrument playing ---------------------------------------------
//
// A plucked or struck string is ONE note with a tall stack of overtones at
// whole multiples of it, often stronger than the note itself. Followed
// pitch by pitch (above), a harpsichord phrase came out wrong in both ways
// the user's ear reported (2026-11-17): the overtones were taken for notes
// of their own ("not the same melody"), and the many that were not kept
// came back as noise ("reading the timbre of the harpsichord as noise").
// So an instrument is heard differently:
//   1. Find each ONSET: the instant a lot of new sound appears at once.
//   2. Look at what is NEW there (the spectrum just after, less the one
//      just before, so notes still ringing do not count) and find the
//      pitch whose whole stack of multiples accounts for it best.
//   3. Accept it only if the stack really is one: enough of its first
//      eight multiples present, each sitting where a multiple should, and
//      together a good share of the new sound. Struck metal and bells
//      (whose pitches are not multiples of anything) fail this and are
//      left to the followed pitches.
//   4. The note sounds until its stack has died away or is struck again.
// Every multiple of a sounding note is then kept out of the noise, kept as
// a layer's overtone or not.

interface StruckNote {
  /** When it is struck (s). */
  at: number;
  /** When its stack has all but died away (s): later than the layer made of it, if other notes fed it. */
  end: number;
  hz: number;
  /** How strong each multiple is: [the note, twice it, three times it, ...]. */
  amps: number[];
  shape: Shape;
  energy: number;
}

function findStruckNotes(x: Float32Array, sampleRate: number): StruckNote[] {
  const N = 1024;
  const H = 256;
  const binHz = sampleRate / N;
  const frames = spectrogram(x, 0, x.length, N, H);
  let loudest = 0;
  for (const frame of frames) for (let i = 2; i < N / 2; i++) if (frame[i] > loudest) loudest = frame[i];
  if (!(loudest > 0)) return [];
  const scale = 1000 / Math.sqrt(loudest);
  // 1. Onsets: how much louder each part of the spectrum got since the last look.
  const flux = frames.map((frame, k) => {
    if (k === 0) return 0;
    const before = frames[k - 1];
    let s = 0;
    for (let i = 2; i < N / 2; i++) {
      const d = Math.log(1 + scale * Math.sqrt(frame[i])) - Math.log(1 + scale * Math.sqrt(before[i]));
      if (d > 0) s += d;
    }
    return s;
  });
  const fluxTop = Math.max(...flux);
  const onsets: number[] = [];
  for (let k = 1; k < flux.length - 2; k++) {
    if (flux[k] < fluxTop * 0.2) continue;
    if (!(flux[k] >= flux[k - 1] && flux[k] > flux[k + 1] && flux[k] >= (flux[k - 2] ?? 0) && flux[k] > flux[k + 2])) continue;
    const last = onsets[onsets.length - 1];
    if (last !== undefined && k - last < 10) { if (flux[k] > flux[last]) onsets[onsets.length - 1] = k; continue; }
    onsets.push(k);
  }

  const FINE = 4096;
  const fineHz = sampleRate / FINE;
  const found: Array<Omit<StruckNote, 'shape' | 'end' | 'energy'> & { frame: number; share: number }> = [];
  for (const k of onsets) {
    const at = (k * H) / sampleRate;
    // 2. What is new: just after, less just before.
    const after = framePower(x, Math.round((at + 0.015) * sampleRate), FINE, 0, x.length);
    const before = framePower(x, Math.round((at - 0.015) * sampleRate) - FINE, FINE, 0, x.length);
    const fresh = new Float64Array(FINE / 2);
    let total = 0;
    const lowBin = Math.ceil(55 / fineHz);
    const highBin = Math.floor(6000 / fineHz);
    for (let i = 1; i < FINE / 2; i++) {
      fresh[i] = Math.max(0, Math.sqrt(after[i]) - Math.sqrt(before[i]));
      if (i >= lowBin && i <= highBin) total += fresh[i] * fresh[i];
    }
    if (!(total > 0)) continue;
    const near = (spectrum: Float64Array, hz: number): number => {
      const c = hz / fineHz;
      let best = 0;
      for (let i = Math.max(1, Math.floor(c * 0.975)); i <= Math.min(FINE / 2 - 1, Math.ceil(c * 1.025)); i++) if (spectrum[i] > best) best = spectrum[i];
      return best;
    };
    const work = Float64Array.from(fresh);
    for (let voice = 0; voice < 2; voice++) {
      let guess = 0;
      let salience = 0;
      for (let hz = 55; hz < 1500; hz *= 1.005) {
        let s = 0;
        for (let m = 1; m <= 12 && m * hz < 8000; m++) s += near(work, m * hz) / Math.sqrt(m);
        if (s > salience) { salience = s; guess = hz; }
      }
      if (!(guess > 0)) break;
      // 3. Is it really one stack? Where each multiple truly sits says what
      //    the note is, and how well they agree says whether it is one.
      const firstEight: number[] = [];
      for (let m = 1; m <= 8 && m * guess < 8000; m++) firstEight.push(near(work, m * guess));
      const tallest = Math.max(...firstEight);
      let weight = 0;
      let weighted = 0;
      const estimates: Array<[number, number]> = [];
      firstEight.forEach((amp, i) => {
        // (Only the first six say where the note is: a stiff string's higher
        // multiples sit a little sharp.)
        if (amp < tallest * 0.1 || i >= 6) return;
        const m = i + 1;
        const c = (m * guess) / fineHz;
        let b = Math.round(c);
        for (let j = Math.max(2, Math.floor(c * 0.975)); j <= Math.min(FINE / 2 - 2, Math.ceil(c * 1.025)); j++) if (work[j] > work[b]) b = j;
        const l = work[b - 1];
        const mid = work[b];
        const r = work[b + 1];
        const shift = l - 2 * mid + r !== 0 ? (0.5 * (l - r)) / (l - 2 * mid + r) : 0;
        const estimate = ((b + Math.max(-0.5, Math.min(0.5, shift))) * fineHz) / m;
        estimates.push([estimate, amp]);
        weight += amp;
        weighted += amp * estimate;
      });
      const hz = weighted / weight;
      const disagreement = estimates.reduce((s, [estimate, amp]) => s + amp * Math.abs(estimate / hz - 1), 0) / weight;
      const amps: number[] = [];
      for (let m = 1; m <= 16 && m * hz < 8000; m++) amps.push(near(work, m * hz));
      const present = amps.slice(0, 8).filter(a => a >= tallest * 0.1).length;
      // How much of what is (still) new the stack accounts for. A LOW note's
      // multiples are so close together that they cover most of the spectrum
      // whatever is in it (a 55 Hz "note" accounted for 85% of a gate's
      // crash by standing everywhere), so the share is judged against what
      // such a comb would cover by chance.
      let explained = 0;
      let remaining = 0;
      for (let i = lowBin; i <= highBin; i++) remaining += work[i] * work[i];
      for (let m = 1; m * hz < 6000; m++) {
        const c = Math.round((m * hz) / fineHz);
        for (let j = c - 1; j <= c + 1; j++) if (j >= lowBin && j <= highBin) explained += work[j] * work[j];
      }
      const byChance = Math.min(0.95, (3 * fineHz) / hz);
      const beyondChance = remaining > 0 ? (explained / remaining - byChance) / (1 - byChance) : 0;
      const share = explained / total;
      // (A lone pitch with no overtones is not a stack: it is left to the followed
      // pitches, which also follow it if it slides.)
      const isStack = weight > 0 && present >= (hz > 450 ? 2 : 3) && disagreement <= 0.02
        && beyondChance >= 0.25 && share >= (voice === 0 ? 0.25 : 0.1);
      if (!isStack) break;
      found.push({ at, frame: k, hz, amps, share });
      for (let m = 1; m * hz < 11000; m++) {
        const c = Math.round((m * hz) / fineHz);
        for (let j = c - 3; j <= c + 3; j++) if (j > 0 && j < FINE / 2) work[j] = 0;
      }
    }
  }

  // A stray stack or two in a sound that is otherwise not an instrument is
  // more likely a rumble whose resonances happen to line up (the winch gave
  // a few): an instrument is believed only where it accounts for a good
  // part of the onsets.
  const struckOnsets = new Set(found.map(note => note.frame)).size;
  if (struckOnsets < onsets.length * 0.4) return [];

  // 4. How long each one sounds: the loudness of its stack, look by look.
  const hopS = H / sampleRate;
  const notes: StruckNote[] = [];
  found.forEach(note => {
    const multiples: number[] = [];
    for (let m = 1; m <= Math.min(10, note.amps.length); m++) multiples.push(Math.round((m * note.hz) / binHz));
    const startFrame = Math.max(0, note.frame - 2);
    const again = found.find(other => other.frame > note.frame && Math.abs(Math.log(other.hz / note.hz)) < 0.03);
    const lastFrame = again ? again.frame - 1 : frames.length - 1;
    const env: number[] = [];
    for (let j = startFrame; j <= lastFrame; j++) {
      let s = 0;
      for (const c of multiples) for (let b = c - 1; b <= c + 1; b++) if (b > 0 && b < N / 2) s += frames[j][b];
      env.push(Math.sqrt(s));
    }
    let top = 0;
    for (let j = 1; j < Math.min(env.length, 24); j++) if (env[j] > env[top]) top = j;
    // The LAYER stops once the stack is down to a twentieth, or at a later
    // onset that feeds it again (another note sharing its multiples: it
    // rises there after having fallen). Only at an onset: two close strings
    // beat against each other, and a dip and swell between onsets is not a
    // new note (a chord's two notes were cut to 75 ms by that).
    let stop = env.length - 1;
    let lowest = env[top];
    for (let j = top + 1; j < env.length; j++) {
      if (env[j] < env[top] * 0.05) { stop = j; break; }
      const frame = startFrame + j;
      const atAnOnset = onsets.some(o => o !== note.frame && Math.abs(o - frame) <= 2);
      if (atAnOnset && lowest < env[top] * 0.6 && Math.max(env[j], env[j + 1] ?? 0, env[j + 2] ?? 0, env[j + 3] ?? 0) > lowest * 1.3) { stop = Math.max(top + 1, j - 2); break; }
      if (env[j] < lowest) lowest = env[j];
    }
    // The STACK goes on ringing, fed or not, until it is all but gone: for
    // that long its multiples are kept out of the noise.
    let quiet = env.length - 1;
    for (let j = top + 1; j < env.length; j++) if (env[j] < env[top] * 0.03) { quiet = j; break; }
    const shape = shapeOf(env.slice(0, stop + 1), hopS, startFrame * hopS, (N / sampleRate) * 0.45);
    if (!shape || shape.length < 0.08) return;
    notes.push({
      at: note.at,
      end: Math.max(shape.start + shape.length, (startFrame + quiet) * hopS),
      hz: note.hz,
      amps: note.amps,
      shape,
      energy: env.slice(0, stop + 1).reduce((s, v) => s + v * v, 0),
    });
  });
  return notes;
}

function followNotes(x: Float32Array, sampleRate: number): { notes: FoundNote[]; pitchesAt: (seconds: number) => number[] } {
  const trackHop = TRACK_HOP / sampleRate;
  // TWO LOOKS, because no one window suits every pitch. Low notes need a
  // long window to be told apart at all (at 46 ms a harpsichord's low
  // strings, 86 Hz apart with overtones every 86 Hz, ran together and never
  // stood "clear": they came out as rumble). High ones need a short one to
  // be timed (a rising run of bells is a new note every tenth of a second).
  const tracked = [
    ...followPitches(x, sampleRate, TRACK_N * 2, 55, 700),
    ...followPitches(x, sampleRate, TRACK_N, 700, 8000),
  ];
  // An instrument's notes (see above). A "struck note" on a pitch that was
  // already sounding and did not jump in loudness there is that same tone
  // going on (a held synthesised tone swelling a little), not a pluck.
  const struck = findStruckNotes(x, sampleRate).filter(note => !tracked.some(p => {
    const k = Math.round(note.at / trackHop);
    if (Math.abs(Math.log(p.mean / note.hz)) > 0.03 || p.start > k - 10 || p.end < k + 8) return false;
    const before = p.amp[Math.max(0, k - 3 - p.start)];
    const after = p.amp[Math.min(p.amp.length - 1, k + 6 - p.start)];
    return after <= before * 1.5;
  }));
  /** Is `hz` one of the multiples of a struck note sounding at `seconds`? */
  const inAStack = (seconds: number, hz: number): boolean => struck.some(note => {
    if (seconds < note.at - 0.03 || seconds > note.end + 0.03) return false;
    const m = Math.round(hz / note.hz);
    return m >= 1 && Math.abs(hz / note.hz - m) <= 0.03 * m;
  });
  const partials = tracked.filter(p => {
    // A followed pitch that BEGINS as one of a struck note's multiples, or is
    // one for most of its life, is that note, not another. (It may well
    // outlast the note's measured end: a string rings on quietly.)
    let inside = 0;
    let atBirth = 0;
    for (let k = p.start; k <= p.end; k++) {
      if (!inAStack(k * trackHop, p.hz[k - p.start])) continue;
      inside++;
      if (k < p.start + 8) atBirth++;
    }
    return atBirth < 5 && inside < (p.end - p.start + 1) * 0.6;
  });

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
    for (const note of struck) {
      if (seconds < note.at - 0.03 || seconds > note.end + 0.03) continue;
      for (let m = 1; m * note.hz < 11000; m++) now.push(m * note.hz);
    }
    return now;
  };

  /** How alike two pitches' loudness is over the time they share (1 = they rise and fall as one). */
  const alike = (p: Partial, q: Partial): number => {
    const from = Math.max(p.start, q.start);
    const to = Math.min(p.end, q.end);
    if (to - from < 4) return 0;
    const u: number[] = [];
    const v: number[] = [];
    for (let k = from; k <= to; k++) { u.push(p.amp[k - p.start]); v.push(q.amp[k - q.start]); }
    const mu = u.reduce((s, w) => s + w, 0) / u.length;
    const mv = v.reduce((s, w) => s + w, 0) / v.length;
    let uv = 0;
    let uu = 0;
    let vv = 0;
    for (let i = 0; i < u.length; i++) { uv += (u[i] - mu) * (v[i] - mv); uu += (u[i] - mu) * (u[i] - mu); vv += (v[i] - mv) * (v[i] - mv); }
    return uu > 0 && vv > 0 ? uv / Math.sqrt(uu * vv) : 0;
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
      // (Within 0.8%. At 2% a drone and an unrelated pitch not quite twice it
      // were made one note, and the drone then pulsed with the other's
      // loudness; high multiples sit so close together that 2% matched by chance.)
      if (whole < 2 || whole > 8 || Math.abs(ratio - whole) > 0.008 * whole) continue;
      // An overtone RISES AND FALLS WITH ITS NOTE: it is the same string. A
      // pitch that happens to be a whole multiple but goes its own way (a
      // synthesised shimmer whose pitches pulse in turn; one that dies in
      // half the time) is a part of its own, to be heard and edited alone:
      // made an overtone, it took on the note's loudness and a spell had a
      // 6 kHz whine twice as long as the real one.
      if (alike(low, high) < 0.6) continue;
      used.add(high);
      group.push(high);
    }
    groups.push(group);
  }

  const hop = TRACK_HOP / sampleRate;
  const found: FoundNote[] = [];
  const weights = new Map<FoundNote, number>();
  for (const group of groups) {
    // The note's own pitch is the lowest of the group, unless that one is
    // much the weakest (then the strongest leads, and the rest are told
    // from it).
    const strongest = group.reduce((p, q) => (q.peak > p.peak ? q : p));
    const main = group[0].peak >= strongest.peak / 1.2 ? group[0] : strongest;
    const others = group.filter(p => p !== main).sort((p, q) => q.peak - p.peak).slice(0, MAX_HARMONICS);
    const shape = shapeOf(main.amp, hop, main.start * hop, main.smear, 0.2, true);
    if (!shape) continue;
    // (Struck, if a close look says so; else the slower of the two readings:
    // no fast start without a real strike.)
    const quick = arrival(x, sampleRate, main.hz[0], shape.start);
    shape.attack = Math.min(quick <= 0.003 ? quick : Math.max(quick, shape.attack), shape.length * 0.8);
    shape.hold = Math.max(0, Math.min(shape.hold, shape.length - shape.attack - shape.tail));
    const third = Math.max(1, Math.floor(main.hz.length / 3));
    const early = median(main.hz.slice(0, third));
    const late = median(main.hz.slice(-third));
    const middle = median(main.hz.slice(third, Math.max(third + 1, main.hz.length - third)));
    // Does it slide? Only if it ends somewhere else, and a long look finds
    // no pitch standing still on the way (see standingPitch).
    const net = Math.abs(Math.log(late / early));
    let moves = net > 0.012;
    let steadyAt = main.mean;
    if (moves) {
      const standing = standingPitch(x, sampleRate, main.start * hop, main.end * hop, Math.min(early, late), Math.max(early, late));
      if (standing > 0) { moves = false; steadyAt = standing; }
      // (Too narrow to tell, and under half a semitone: not worth calling a slide.)
      else if (standing < 0 && net < 0.03) moves = false;
    }
    const clampHz = (hz: number) => Math.max(30, Math.min(8000, hz));
    const from = clampHz(moves ? early : steadyAt);
    const to = clampHz(moves ? late : steadyAt);
    const bent = moves && Math.abs(Math.log(middle / Math.sqrt(early * late))) > 0.02;
    const members = [main, ...others];
    const note: FoundNote = {
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
    };
    found.push(note);
    weights.set(note, members.reduce((s, p) => s + p.weight, 0));
  }
  // The same standing pitch, reached by two tracks at the same time (two
  // walks ending on one bell), is one note: the weightier, lasting as long
  // as both.
  found.sort((p, q) => p.shape.start - q.shape.start);
  for (let i = 0; i < found.length; i++) {
    for (let j = i + 1; j < found.length; j++) {
      const a = found[i];
      const b = found[j];
      if (a.from !== a.to || b.from !== b.to || Math.abs(Math.log(a.from / b.from)) > 0.006) continue;
      // (Sounding together for most of the shorter one's life. The same bell
      // struck again as the first dies is two notes, each with its own loudness.)
      const aEnd = a.shape.start + a.shape.length;
      const bEnd = b.shape.start + b.shape.length;
      if (Math.min(aEnd, bEnd) - b.shape.start < Math.min(a.shape.length, b.shape.length) * 0.5) continue;
      const end = Math.max(aEnd, bEnd);
      const keep = weights.get(b)! > weights.get(a)! ? b : a;
      const joined: FoundNote = {
        ...keep,
        // (It FADES over the longer life, it is not held for it: held, a bell
        // struck twice became a high note sounding at full for a second.)
        shape: { ...keep.shape, start: a.shape.start, length: end - a.shape.start, attack: a.shape.attack },
        energy: a.energy + b.energy,
      };
      weights.set(joined, weights.get(a)! + weights.get(b)!);
      found[i] = joined;
      found.splice(j, 1);
      j--;
    }
  }

  // The struck notes, each with its four strongest overtones.
  const played: FoundNote[] = struck
    .sort((p, q) => q.energy - p.energy)
    .slice(0, MAX_STRUCK)
    .map(note => {
      const shape = { ...note.shape };
      const overtones = note.amps
        .map((amp, i) => ({ multiple: i + 1, amp }))
        .slice(1)
        .sort((p, q) => q.amp - p.amp)
        .slice(0, MAX_HARMONICS)
        .filter(o => o.amp > Math.max(...note.amps) * 0.05)
        .sort((p, q) => p.multiple - q.multiple);
      const strongest = note.amps.indexOf(Math.max(...note.amps)) + 1;
      shape.attack = Math.min(arrival(x, sampleRate, strongest * note.hz, shape.start), shape.length * 0.8);
      shape.hold = Math.max(0, Math.min(shape.hold, shape.length - shape.attack - shape.tail));
      const hz = Math.max(30, Math.min(8000, note.hz));
      const base = Math.max(note.amps[0], 1e-12);
      return {
        shape,
        from: hz,
        to: hz,
        // (An overtone can be several times stronger than a low string's own note.)
        harmonics: overtones.map(o => ({ ratio: o.multiple, level: round(Math.min(3, o.amp / base), 2) })),
        bands: [1, ...overtones.map(o => o.multiple)].map(m => {
          const half = Math.max(25, m * hz * 0.03);
          return [Math.max(20, m * hz - half), m * hz + half] as const;
        }),
        energy: note.energy,
      };
    });
  // The followed ones: when there are more than there is room for, EVERY
  // PART OF THE SOUND GETS ITS STRONGEST NOTE before any part gets a second.
  // Taken simply strongest first, all sixteen came from the loud middle of a
  // rising run and none from the soft opening that makes it a RISE. So the
  // sound is cut into as many stretches as there is room; each gives the
  // weightiest note that starts in it; what room the empty stretches leave
  // goes by weight (how much of the sound a note is moment by moment:
  // "which notes are kept").
  const room = Math.max(0, MAX_NOTES - played.length);
  const byWeight = [...found].sort((p, q) => weights.get(q)! - weights.get(p)!);
  const followed: FoundNote[] = [];
  if (byWeight.length > room && room >= 2) {
    const first = Math.min(...found.map(note => note.shape.start));
    const last = Math.max(...found.map(note => note.shape.start));
    const stretches = room;
    const each = (last - first) / stretches + 1e-9;
    for (let s = 0; s < stretches; s++) {
      const pick = byWeight.find(note => !followed.includes(note) && Math.floor((note.shape.start - first) / each) === s);
      if (pick) followed.push(pick);
    }
  }
  for (const note of byWeight) if (followed.length < room && !followed.includes(note)) followed.push(note);
  return {
    notes: [...played, ...followed].sort((p, q) => p.shape.start - q.shape.start),
    pitchesAt,
  };
}
