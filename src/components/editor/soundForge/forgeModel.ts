// The Sound Forge's working parts that are not components: starting points,
// the "it sounds like..." tips, and small helpers for layers and numbers.

import type { FilterStage, SynthLayer, SynthSound } from '../../../utils/synth/types';

// ---- ids, copies --------------------------------------------------------------

let counter = 0;
/** A layer id that is unique within this visit (layers only need to differ inside one sound). */
export function newLayerId(): string {
  counter += 1;
  return `layer-${Date.now().toString(36)}-${counter}`;
}

export function cloneSound(sound: SynthSound): SynthSound {
  return JSON.parse(JSON.stringify(sound)) as SynthSound;
}

export function sameSound(a: SynthSound, b: SynthSound): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---- the reference level --------------------------------------------------------
// "Torch goes out" is the sound the user approved by ear (2026-11-15: "sounds
// great! Even on mobile!"). Its loudness is the yardstick the Forge shows
// every other sound against. Measured from the shipped recipe.
export const REFERENCE = {
  name: 'the torch going out',
  /** Loudest 50ms stretch (RMS). */
  loudness: 0.0256,
  peak: 0.079,
} as const;

// ---- pitch as a note name --------------------------------------------------------

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** 440 -> "A4". Empty outside the range a note name helps. */
export function noteName(hz: number): string {
  if (!(hz >= 16) || hz > 20000) return '';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

// ---- starting points for a new LAYER ---------------------------------------------
// Each is a layer that already sounds like something, to be bent into shape:
// easier than starting from silence. Levels sit near the reference.

export interface LayerStarter {
  id: string;
  label: string;
  hint: string;
  make: () => Omit<SynthLayer, 'id'>;
}

const band = (from: number, to: number, q: number): FilterStage => ({ type: 'bandpass', q, cutoff: { from, to } });

export const LAYER_STARTERS: readonly LayerStarter[] = [
  {
    id: 'whoosh', label: 'Whoosh', hint: 'Air moving: noise that swells and falls away',
    make: () => ({
      name: 'Whoosh', source: 'noise', start: 0, length: 0.4, level: 0.6, attack: 0.12, hold: 0, floor: 0.05, tail: 0.05,
      noiseSeed: 0.3, filters: [band(700, 1600, 0.9)],
    }),
  },
  {
    id: 'hiss', label: 'Hiss', hint: 'A thin, bright hiss: steam, embers, a fuse',
    make: () => ({
      name: 'Hiss', source: 'noise', start: 0, length: 0.5, level: 0.3, attack: 0.08, hold: 0.05, floor: 0.05, tail: 0.05,
      noiseSeed: 1.1, filters: [band(5000, 3000, 0.8)],
    }),
  },
  {
    id: 'rumble', label: 'Rumble', hint: 'Low, dull noise: stone, weight, distance',
    make: () => ({
      name: 'Rumble', source: 'noise', start: 0, length: 0.6, level: 1.2, attack: 0.05, hold: 0.1, floor: 0.05, tail: 0.08,
      noiseSeed: 0.8, filters: [{ type: 'lowpass', cutoff: { from: 320, to: 180 } }],
    }),
  },
  {
    id: 'click', label: 'Click', hint: 'A tiny burst of noise: a tick, a latch, a pebble',
    make: () => ({
      name: 'Click', source: 'noise', start: 0, length: 0.012, level: 0.5, attack: 0, hold: 0, floor: 0.02, tail: 0.004,
      noiseSeed: 0.5, filters: [{ type: 'highpass', cutoff: { from: 1500, to: 1500 } }],
    }),
  },
  {
    id: 'thud', label: 'Thud', hint: 'A low note that drops: a hit, a landing',
    make: () => ({
      name: 'Thud', source: 'tone', wave: 'sine', start: 0, length: 0.12, level: 0.5, attack: 0.003, hold: 0, floor: 0.02, tail: 0.02,
      pitch: { from: 140, to: 55, arriveAt: 0.07 },
    }),
  },
  {
    id: 'blip', label: 'Blip', hint: 'A short, plain note: a button, a coin, a step',
    make: () => ({
      name: 'Blip', source: 'tone', wave: 'square', start: 0, length: 0.09, level: 0.12, attack: 0.002, hold: 0.03, floor: 0.1, tail: 0.02,
      pitch: { from: 660, to: 880 },
    }),
  },
  {
    id: 'chime', label: 'Chime', hint: 'A clear note that rings away, with a bell-like partner',
    make: () => ({
      name: 'Chime', source: 'tone', wave: 'sine', start: 0, length: 0.5, level: 0.15, attack: 0.005, hold: 0, floor: 0.01, tail: 0.03,
      pitch: { from: 1568, to: 1568 }, overtone: { ratio: 2.76, level: 0.22 },
    }),
  },
  {
    id: 'buzz', label: 'Buzz', hint: 'A rough note that falls: a zap, a growl, magic gone wrong',
    make: () => ({
      name: 'Buzz', source: 'tone', wave: 'sawtooth', start: 0, length: 0.25, level: 0.1, attack: 0.005, hold: 0.02, floor: 0.05, tail: 0.03,
      pitch: { from: 520, to: 130 }, filters: [{ type: 'lowpass', cutoff: { from: 4000, to: 900 } }],
    }),
  },
];

export function layerFromStarter(starterId: string): SynthLayer {
  const starter = LAYER_STARTERS.find(s => s.id === starterId) ?? LAYER_STARTERS[0];
  return { id: newLayerId(), ...starter.make() };
}

// ---- starting points for a new SOUND -----------------------------------------------
// Rough sketches, never tuned by ear: somewhere to start, not finished sounds.

export interface SoundStarter {
  id: string;
  label: string;
  hint: string;
  make: () => SynthSound;
}

const withIds = (level: number, layers: Array<Omit<SynthLayer, 'id'>>): SynthSound => ({
  version: 1,
  level,
  layers: layers.map(l => ({ id: newLayerId(), ...l })),
});

const starterLayer = (id: string, changes: Partial<SynthLayer> = {}): Omit<SynthLayer, 'id'> => ({
  ...(LAYER_STARTERS.find(s => s.id === id) ?? LAYER_STARTERS[0]).make(),
  ...changes,
});

export const SOUND_STARTERS: readonly SoundStarter[] = [
  {
    id: 'blank', label: 'One whoosh', hint: 'A single layer of air to shape',
    make: () => withIds(0.25, [starterLayer('whoosh')]),
  },
  {
    id: 'pickup', label: 'Pickup', hint: 'Two quick rising notes',
    make: () => withIds(0.3, [
      starterLayer('blip', { name: 'First note', pitch: { from: 880, to: 880 } }),
      starterLayer('blip', { name: 'Second note', start: 0.07, length: 0.16, pitch: { from: 1320, to: 1320 } }),
    ]),
  },
  {
    id: 'hit', label: 'Hit', hint: 'A thud with a click on top',
    make: () => withIds(0.3, [starterLayer('thud'), starterLayer('click', { level: 0.8 })]),
  },
  {
    id: 'zap', label: 'Zap', hint: 'A rough falling note with a wobble',
    make: () => withIds(0.3, [starterLayer('buzz', { vibrato: { rate: 28, depth: 60 } })]),
  },
  {
    id: 'chime', label: 'Chime', hint: 'Two bell notes, a fifth apart',
    make: () => withIds(0.12, [
      starterLayer('chime'),
      starterLayer('chime', { name: 'Higher chime', start: 0.09, pitch: { from: 2349, to: 2349 }, level: 0.12 }),
    ]),
  },
];

// ---- "it sounds like..." ---------------------------------------------------------
// What the user's ear said while the first six sounds were tuned, turned
// round into advice. Each of these was a real round of feedback.

export const TIPS: ReadonlyArray<{ hears: string; why: string; try: string }> = [
  {
    hears: 'a knock or a thump, when it should be soft',
    why: 'A low layer reaches full loudness almost at once.',
    try: 'Lengthen its Swell, or raise its pitch. Only a real impact should start at once.',
  },
  {
    hears: 'sand or grit',
    why: 'A bright hiss with clicks on top reads as grains landing.',
    try: 'Turn the hiss down, drop the clicks, or cut the highs.',
  },
  {
    hears: 'a robot or a voice',
    why: 'A NARROW band of noise sliding in pitch is how a synthetic voice is made.',
    try: 'Widen the band (lower Narrowness), or shorten the slide.',
  },
  {
    hears: 'creaky',
    why: 'A slow, deep tremble in loudness.',
    try: 'Make the Tremble faster and shallower.',
  },
  {
    hears: 'a broom sweeping',
    why: 'Noise whose pitch rises and then falls is the gesture of a stroke.',
    try: 'Let it only rise or only fall: remove the turning point.',
  },
  {
    hears: 'a hollow box',
    why: 'A low note that rings on, over a narrow band in the middle.',
    try: 'Shorten the note and lower it; make the noise broad and cut its lows.',
  },
  {
    hears: 'right, but far too intense',
    why: 'Usually nothing is wrong except loudness.',
    try: `Lower the sound's Level until the meter sits near ${REFERENCE.name}.`,
  },
  {
    hears: 'the notes are louder than the noise',
    why: 'A clear note is far louder to the ear than noise at the same number.',
    try: 'Give tones about half the level you would give a hiss.',
  },
  {
    hears: 'nothing on a phone',
    why: 'Phone speakers cannot play much below about 300 Hz.',
    try: 'Add a layer above that: a click or a band of noise carries the sound.',
  },
];

// ---- Surprise me -------------------------------------------------------------------

/** Nudge a layer's pitch, colour and timing by up to `amount` (0.2 = 20%), keeping its loudness. */
export function nudgeLayer(layer: SynthLayer, amount: number, random: () => number): SynthLayer {
  const bend = (v: number) => v * (1 + (random() * 2 - 1) * amount);
  const next: SynthLayer = JSON.parse(JSON.stringify(layer)) as SynthLayer;
  next.length = Math.max(0.005, bend(next.length));
  next.attack = Math.min(next.length, bend(next.attack));
  if (next.pitch) {
    next.pitch.from = bend(next.pitch.from);
    next.pitch.to = bend(next.pitch.to);
    if (next.pitch.via) next.pitch.via.value = bend(next.pitch.via.value);
    if (next.pitch.arriveAt !== undefined) next.pitch.arriveAt = Math.min(next.length, next.pitch.arriveAt);
  }
  for (const stage of next.filters ?? []) {
    stage.cutoff.from = bend(stage.cutoff.from);
    stage.cutoff.to = bend(stage.cutoff.to);
    if (stage.cutoff.via) stage.cutoff.via.value = bend(stage.cutoff.via.value);
  }
  if (next.source === 'noise') next.noiseSeed = random() * 2;
  return next;
}

// ---- the loudness curve of one layer, for drawing ------------------------------------

/** Points (time in s from the layer's start, loudness 0-1 of its peak) tracing a layer's volume. */
export function envelopePoints(layer: SynthLayer): Array<[number, number]> {
  const length = Math.max(0.0001, layer.length);
  const attack = Math.max(0, Math.min(layer.attack, length));
  const tail = Math.max(0, Math.min(layer.tail, length));
  const points: Array<[number, number]> = [[0, attack > 0 ? 0 : 1], [attack, 1]];
  const fadeFrom = attack + Math.max(0, layer.hold);
  const fadeTo = length - tail;
  if (fadeFrom < fadeTo) {
    points.push([fadeFrom, 1]);
    // The fade is exponential: sample it so the curve looks like it sounds.
    const floor = Math.max(1e-5, layer.floor);
    for (let i = 1; i <= 8; i++) {
      const u = i / 8;
      points.push([fadeFrom + (fadeTo - fadeFrom) * u, Math.pow(floor, u)]);
    }
    points.push([length, tail > 0 ? 0 : floor]);
  } else {
    points.push([Math.max(attack, fadeTo), 1]);
    points.push([length, tail > 0 ? 0 : 1]);
  }
  return points;
}
