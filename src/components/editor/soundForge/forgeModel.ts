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

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** The pitch (Hz) of a note: `index` 0-11 from C, in `octave` (A4 = 440 Hz). */
export function noteHz(index: number, octave: number): number {
  return 440 * Math.pow(2, ((octave + 1) * 12 + index - 69) / 12);
}

/** The nearest note to a pitch: which of the twelve, which octave, and how far off (cents; 100 = one key). */
export function nearestNote(hz: number): { index: number; octave: number; cents: number } {
  const exact = 69 + 12 * Math.log2(Math.max(1, hz) / 440);
  const midi = Math.round(exact);
  return { index: ((midi % 12) + 12) % 12, octave: Math.floor(midi / 12) - 1, cents: Math.round((exact - midi) * 100) };
}
/** 440 -> "A4". Empty outside the range a note name helps. */
export function noteName(hz: number): string {
  if (!(hz >= 16) || hz > 20000) return '';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

// ---- starting points for a new LAYER ---------------------------------------------
// Each is a layer that already sounds like something, to be bent into shape:
// easier than starting from silence. Levels sit near the reference.
//
// INSTRUMENTS (user ask 2026-11-15: "tones more similar to the OSRS sound
// font"). OSRS builds each tone from up to five stacked oscillators, with a
// loudness shape and an optional filter; these are the same idea: a wave, a
// stack of notes above it (LayerPanel "Stacked notes"), and how it rises
// and dies. None has been heard by anyone: they are built from how each
// instrument is known to work, and are there to be tuned.

export type LayerGroup = 'Air' | 'Hits' | 'Notes' | 'Instruments';

export interface LayerStarter {
  id: string;
  label: string;
  group: LayerGroup;
  hint: string;
  make: () => Omit<SynthLayer, 'id'>;
}

const band = (from: number, to: number, q: number): FilterStage => ({ type: 'bandpass', q, cutoff: { from, to } });
const steady = (hz: number) => ({ from: hz, to: hz });
/** A note by name: note('A', 4) is 440 Hz. */
const note = (name: string, octave: number) => noteHz(NOTE_NAMES.indexOf(name), octave);

export const LAYER_STARTERS: readonly LayerStarter[] = [
  // ---- air
  {
    id: 'whoosh', label: 'Whoosh', group: 'Air', hint: 'Air moving: noise that swells and falls away',
    make: () => ({
      name: 'Whoosh', source: 'noise', start: 0, length: 0.4, level: 0.6, attack: 0.12, hold: 0, floor: 0.05, tail: 0.05,
      noiseSeed: 0.3, filters: [band(700, 1600, 0.9)],
    }),
  },
  {
    id: 'hiss', label: 'Hiss', group: 'Air', hint: 'A thin, bright hiss: steam, embers, a fuse',
    make: () => ({
      name: 'Hiss', source: 'noise', start: 0, length: 0.5, level: 0.3, attack: 0.08, hold: 0.05, floor: 0.05, tail: 0.05,
      noiseSeed: 1.1, filters: [band(5000, 3000, 0.8)],
    }),
  },
  {
    id: 'rumble', label: 'Rumble', group: 'Air', hint: 'Low, dull noise: stone, weight, distance',
    make: () => ({
      name: 'Rumble', source: 'noise', start: 0, length: 0.6, level: 1.2, attack: 0.05, hold: 0.1, floor: 0.05, tail: 0.08,
      noiseSeed: 0.8, filters: [{ type: 'lowpass', cutoff: { from: 320, to: 180 } }],
    }),
  },
  // ---- hits
  {
    id: 'click', label: 'Click', group: 'Hits', hint: 'A tiny burst of noise: a tick, a latch, a pebble',
    make: () => ({
      name: 'Click', source: 'noise', start: 0, length: 0.012, level: 0.5, attack: 0, hold: 0, floor: 0.02, tail: 0.004,
      noiseSeed: 0.5, filters: [{ type: 'highpass', cutoff: steady(1500) }],
    }),
  },
  {
    id: 'thud', label: 'Thud', group: 'Hits', hint: 'A low note that drops: a hit, a landing',
    make: () => ({
      name: 'Thud', source: 'tone', wave: 'sine', start: 0, length: 0.12, level: 0.5, attack: 0.003, hold: 0, floor: 0.02, tail: 0.02,
      pitch: { from: 140, to: 55, arriveAt: 0.07 },
    }),
  },
  {
    id: 'drum', label: 'Drum', group: 'Hits', hint: 'A tom: a low note that drops and rings a little',
    make: () => ({
      name: 'Drum', source: 'tone', wave: 'sine', start: 0, length: 0.24, level: 0.5, attack: 0.002, hold: 0, floor: 0.02, tail: 0.03,
      pitch: { from: 190, to: 80, arriveAt: 0.1 }, harmonics: [{ ratio: 1.6, level: 0.25 }],
    }),
  },
  {
    id: 'snare', label: 'Snare', group: 'Hits', hint: 'A dry crack of noise: a snare, a whip, a snapped twig',
    make: () => ({
      name: 'Snare', source: 'noise', start: 0, length: 0.14, level: 0.5, attack: 0.001, hold: 0, floor: 0.02, tail: 0.02,
      noiseSeed: 1.4, filters: [{ type: 'highpass', cutoff: steady(1100) }],
    }),
  },
  // ---- notes
  {
    id: 'blip', label: 'Blip', group: 'Notes', hint: 'A short, plain note: a button, a coin, a step',
    make: () => ({
      name: 'Blip', source: 'tone', wave: 'square', start: 0, length: 0.09, level: 0.12, attack: 0.002, hold: 0.03, floor: 0.1, tail: 0.02,
      pitch: steady(note('E', 5)),
    }),
  },
  {
    id: 'chime', label: 'Chime', group: 'Notes', hint: 'A clear note that rings away, with a clashing note above it',
    make: () => ({
      name: 'Chime', source: 'tone', wave: 'sine', start: 0, length: 0.5, level: 0.15, attack: 0.005, hold: 0, floor: 0.01, tail: 0.03,
      pitch: steady(note('G', 6)), harmonics: [{ ratio: 2.76, level: 0.22 }],
    }),
  },
  {
    id: 'bell', label: 'Bell', group: 'Notes', hint: 'A deeper bell: several clashing notes that ring for a long time',
    make: () => ({
      name: 'Bell', source: 'tone', wave: 'sine', start: 0, length: 1.1, level: 0.14, attack: 0.003, hold: 0, floor: 0.008, tail: 0.05,
      pitch: steady(note('A', 4)), harmonics: [{ ratio: 2.76, level: 0.45 }, { ratio: 5.4, level: 0.25 }, { ratio: 8.93, level: 0.1 }],
    }),
  },
  {
    id: 'buzz', label: 'Buzz', group: 'Notes', hint: 'A rough note that falls: a zap, a growl, magic gone wrong',
    make: () => ({
      name: 'Buzz', source: 'tone', wave: 'sawtooth', start: 0, length: 0.25, level: 0.1, attack: 0.005, hold: 0.02, floor: 0.05, tail: 0.03,
      pitch: { from: 520, to: 130 }, filters: [{ type: 'lowpass', cutoff: { from: 4000, to: 900 } }],
    }),
  },
  // ---- instruments
  {
    id: 'pluck', label: 'Harp', group: 'Instruments', hint: 'A plucked string: starts bright at once, then dulls as it dies away',
    make: () => ({
      name: 'Harp', source: 'tone', wave: 'triangle', start: 0, length: 0.6, level: 0.16, attack: 0.002, hold: 0, floor: 0.01, tail: 0.04,
      pitch: steady(note('A', 4)), harmonics: [{ ratio: 2, level: 0.5 }, { ratio: 3, level: 0.25 }, { ratio: 4, level: 0.12 }],
      filters: [{ type: 'lowpass', cutoff: { from: 5200, to: 900 } }],
    }),
  },
  {
    id: 'flute', label: 'Flute', group: 'Instruments', hint: 'A breathy pipe: it swells in gently and sings with a slow wobble',
    make: () => ({
      name: 'Flute', source: 'tone', wave: 'sine', start: 0, length: 0.5, level: 0.16, attack: 0.05, hold: 0.28, floor: 0.3, tail: 0.07,
      pitch: steady(note('D', 5)), harmonics: [{ ratio: 2, level: 0.25 }, { ratio: 3, level: 0.08 }],
      vibrato: { rate: 5, depth: 12 },
    }),
  },
  {
    id: 'organ', label: 'Organ', group: 'Instruments', hint: 'A pipe organ: whole-number notes stacked into one steady, hollow tone',
    make: () => ({
      name: 'Organ', source: 'tone', wave: 'sine', start: 0, length: 0.5, level: 0.11, attack: 0.012, hold: 0.36, floor: 0.6, tail: 0.05,
      pitch: steady(note('C', 4)), harmonics: [{ ratio: 2, level: 0.6 }, { ratio: 3, level: 0.35 }, { ratio: 4, level: 0.25 }],
    }),
  },
  {
    id: 'horn', label: 'Horn', group: 'Instruments', hint: 'A brass call: a buzzy note whose brightness opens up as it starts',
    make: () => ({
      name: 'Horn', source: 'tone', wave: 'sawtooth', start: 0, length: 0.5, level: 0.1, attack: 0.04, hold: 0.3, floor: 0.4, tail: 0.07,
      pitch: steady(note('G', 4)),
      filters: [{ type: 'lowpass', cutoff: { from: 420, via: { value: 2300, at: 0.08 }, to: 1100 } }],
    }),
  },
  {
    id: 'strings', label: 'Strings', group: 'Instruments', hint: 'A string section: a slow swell, thickened by a second note a hair off the first',
    make: () => ({
      name: 'Strings', source: 'tone', wave: 'sawtooth', start: 0, length: 0.8, level: 0.07, attack: 0.14, hold: 0.36, floor: 0.5, tail: 0.14,
      pitch: steady(note('E', 4)), harmonics: [{ ratio: 1.006, level: 0.8 }],
      filters: [{ type: 'lowpass', cutoff: steady(2400) }], vibrato: { rate: 5.5, depth: 14 },
    }),
  },
  {
    id: 'lead', label: 'Square lead', group: 'Instruments', hint: 'The classic old-game melody voice: a hollow note with its top taken off',
    make: () => ({
      name: 'Square lead', source: 'tone', wave: 'square', start: 0, length: 0.25, level: 0.08, attack: 0.003, hold: 0.16, floor: 0.5, tail: 0.03,
      pitch: steady(note('C', 5)), filters: [{ type: 'lowpass', cutoff: steady(3500) }],
    }),
  },
];

export const LAYER_GROUPS: readonly LayerGroup[] = ['Air', 'Hits', 'Notes', 'Instruments'];

export function layerFromStarter(starterId: string): SynthLayer {
  const starter = LAYER_STARTERS.find(s => s.id === starterId) ?? LAYER_STARTERS[0];
  return { id: newLayerId(), ...starter.make() };
}

// ---- starting points for a new SOUND -----------------------------------------------
// Rough sketches, never tuned by ear: somewhere to start, not finished sounds.
// Each is built from the layer starters above. Their overall levels were set
// by MEASURING them: noise sketches sit a little above the reference torch
// sound, sketches made of clear notes at about half of it (a clear note is
// far louder to the ear than noise at the same number).

export type SoundGroup = 'Blank' | 'Interface' | 'Combat' | 'Magic' | 'World' | 'Outcome';

export interface SoundStarter {
  id: string;
  label: string;
  group: SoundGroup;
  hint: string;
  make: () => SynthSound;
}

const sketch = (level: number, layers: Array<Omit<SynthLayer, 'id'>>, echo?: SynthSound['echo']): SynthSound => ({
  version: 1,
  level,
  layers: layers.map(l => ({ id: newLayerId(), ...l })),
  ...(echo ? { echo } : {}),
});

/** A layer starter with some of its numbers changed. */
const L = (id: string, changes: Partial<SynthLayer> = {}): Omit<SynthLayer, 'id'> => ({
  ...(LAYER_STARTERS.find(s => s.id === id) ?? LAYER_STARTERS[0]).make(),
  ...changes,
});

/** The measured overall level of each sketch (see the note above). */
const LEVEL: Record<string, number> = {
  blank: 0.38,
  'one-note': 0.15,
  click: 0.42,
  confirm: 0.24,
  deny: 0.32,
  'set-down': 0.19,
  lift: 0.21,
  slash: 0.25,
  hit: 0.16,
  clank: 0.22,
  arrow: 0.26,
  hurt: 0.37,
  fall: 0.34,
  cast: 0.15,
  fire: 0.28,
  ice: 0.17,
  heal: 0.14,
  poison: 0.53,
  teleport: 0.13,
  zap: 0.35,
  door: 0.13,
  lever: 0.27,
  coin: 0.17,
  keys: 0.23,
  chest: 0.16,
  plate: 0.18,
  fanfare: 0.31,
  defeat: 0.27,
  'life-lost': 0.11,
};
const level = (id: string) => LEVEL[id] ?? 0.2;

export const SOUND_STARTERS: readonly SoundStarter[] = [
  // ---- blank
  { id: 'blank', label: 'One whoosh', group: 'Blank', hint: 'A single layer of air to shape', make: () => sketch(level('blank'), [L('whoosh')]) },
  { id: 'one-note', label: 'One note', group: 'Blank', hint: 'A single steady note to shape', make: () => sketch(level('one-note'), [L('blip', { length: 0.25, hold: 0.1 })]) },

  // ---- interface
  {
    id: 'click', label: 'Button click', group: 'Interface', hint: 'A tick with a tiny note in it',
    make: () => sketch(level('click'), [
      L('click', { level: 0.6 }),
      { name: 'Tick note', source: 'tone', wave: 'sine', start: 0, length: 0.03, level: 0.15, attack: 0.001, hold: 0, floor: 0.05, tail: 0.01, pitch: steady(note('D', 6)) },
    ]),
  },
  {
    id: 'confirm', label: 'Confirm', group: 'Interface', hint: 'Two notes going up: yes',
    make: () => sketch(level('confirm'), [
      L('blip', { name: 'First note', wave: 'triangle', pitch: steady(note('E', 5)) }),
      L('blip', { name: 'Second note', wave: 'triangle', start: 0.08, length: 0.16, pitch: steady(note('A', 5)) }),
    ]),
  },
  {
    id: 'deny', label: 'Denied', group: 'Interface', hint: 'Two low notes going down: no',
    make: () => sketch(level('deny'), [
      L('blip', { name: 'First note', length: 0.1, pitch: steady(note('A', 3)), filters: [{ type: 'lowpass', cutoff: steady(1800) }] }),
      L('blip', { name: 'Second note', start: 0.11, length: 0.16, pitch: steady(note('E', 3)), filters: [{ type: 'lowpass', cutoff: steady(1800) }] }),
    ]),
  },
  {
    id: 'set-down', label: 'Set down', group: 'Interface', hint: 'Placing a piece: a soft thud and a tick',
    make: () => sketch(level('set-down'), [L('thud', { pitch: { from: 160, to: 80, arriveAt: 0.05 }, length: 0.09 }), L('click', { level: 0.5 })]),
  },
  {
    id: 'lift', label: 'Pick up', group: 'Interface', hint: 'Lifting a piece: a short note sliding up',
    make: () => sketch(level('lift'), [
      { name: 'Lift', source: 'tone', wave: 'sine', start: 0, length: 0.08, level: 0.2, attack: 0.004, hold: 0, floor: 0.1, tail: 0.02, pitch: { from: note('E', 4), to: note('B', 4) } },
      L('click', { level: 0.3 }),
    ]),
  },

  // ---- combat
  {
    id: 'slash', label: 'Sword slash', group: 'Combat', hint: 'A fast sweep of air from high to low',
    make: () => sketch(level('slash'), [
      { name: 'Sweep', source: 'noise', start: 0, length: 0.16, level: 0.7, attack: 0.012, hold: 0, floor: 0.05, tail: 0.03, noiseSeed: 0.7, filters: [band(5200, 1400, 1.2)] },
      L('hiss', { name: 'Edge', length: 0.12, level: 0.2, attack: 0.01, hold: 0 }),
    ]),
  },
  { id: 'hit', label: 'Hit', group: 'Combat', hint: 'A thud with a click on top', make: () => sketch(level('hit'), [L('thud'), L('click', { level: 0.8 })]) },
  {
    id: 'clank', label: 'Shield clank', group: 'Combat', hint: 'Metal on metal: clashing notes, very short',
    make: () => sketch(level('clank'), [
      {
        name: 'Clank', source: 'tone', wave: 'square', start: 0, length: 0.2, level: 0.1, attack: 0.001, hold: 0, floor: 0.02, tail: 0.03,
        pitch: steady(note('D#', 5)), harmonics: [{ ratio: 1.48, level: 0.6 }, { ratio: 2.31, level: 0.4 }, { ratio: 3.9, level: 0.25 }],
      },
      L('click', { level: 0.5 }),
    ]),
  },
  {
    id: 'arrow', label: 'Arrow', group: 'Combat', hint: 'A quick rising hiss with a short falling note',
    make: () => sketch(level('arrow'), [
      { name: 'Flight', source: 'noise', start: 0, length: 0.1, level: 0.6, attack: 0.02, hold: 0, floor: 0.05, tail: 0.02, noiseSeed: 0.2, filters: [band(2400, 5200, 1)] },
      { name: 'String', source: 'tone', wave: 'sine', start: 0, length: 0.06, level: 0.15, attack: 0.002, hold: 0, floor: 0.05, tail: 0.01, pitch: { from: 900, to: 480 } },
    ]),
  },
  {
    id: 'hurt', label: 'Hurt', group: 'Combat', hint: 'A rough note dropping quickly',
    make: () => sketch(level('hurt'), [L('buzz', { length: 0.16, pitch: { from: 260, to: 150 }, filters: [{ type: 'lowpass', cutoff: steady(1500) }] })]),
  },
  {
    id: 'fall', label: 'Defeated', group: 'Combat', hint: 'A long rough note sinking away',
    make: () => sketch(level('fall'), [
      L('buzz', { length: 0.45, pitch: { from: 300, to: 70 }, filters: [{ type: 'lowpass', cutoff: { from: 1800, to: 500 } }], vibrato: { rate: 9, depth: 50 } }),
    ]),
  },

  // ---- magic
  {
    id: 'cast', label: 'Spell cast', group: 'Magic', hint: 'A rising, wavering note that ends on a chime, with echoes',
    make: () => sketch(level('cast'), [
      { name: 'Rise', source: 'tone', wave: 'sine', start: 0, length: 0.32, level: 0.14, attack: 0.03, hold: 0.1, floor: 0.2, tail: 0.05, pitch: { from: note('G', 4), to: note('G', 6) }, vibrato: { rate: 14, depth: 40 } },
      L('chime', { start: 0.26, length: 0.4 }),
    ], { time: 0.09, repeats: 3, fade: 0.45 }),
  },
  {
    id: 'fire', label: 'Fire bolt', group: 'Magic', hint: 'A whoosh with a hiss over a low rumble',
    make: () => sketch(level('fire'), [
      L('whoosh', { length: 0.3, attack: 0.05, filters: [band(600, 1800, 0.9)] }),
      L('hiss', { length: 0.28, level: 0.25 }),
      L('rumble', { length: 0.3, level: 0.8 }),
    ]),
  },
  {
    id: 'ice', label: 'Ice', group: 'Magic', hint: 'Three glassy high notes, close together, with echoes',
    make: () => sketch(level('ice'), [
      L('chime', { name: 'Shard 1', length: 0.25, pitch: steady(note('E', 7)) }),
      L('chime', { name: 'Shard 2', start: 0.04, length: 0.25, pitch: steady(note('G', 7)) }),
      L('chime', { name: 'Shard 3', start: 0.08, length: 0.3, pitch: steady(note('B', 7)) }),
    ], { time: 0.07, repeats: 3, fade: 0.4 }),
  },
  {
    id: 'heal', label: 'Heal', group: 'Magic', hint: 'A harp running up a major chord',
    make: () => sketch(level('heal'), [
      L('pluck', { name: 'Harp 1', pitch: steady(note('C', 5)) }),
      L('pluck', { name: 'Harp 2', start: 0.07, pitch: steady(note('E', 5)) }),
      L('pluck', { name: 'Harp 3', start: 0.14, pitch: steady(note('G', 5)) }),
      L('pluck', { name: 'Harp 4', start: 0.21, length: 0.75, pitch: steady(note('C', 6)) }),
    ]),
  },
  {
    id: 'poison', label: 'Poison', group: 'Magic', hint: 'A low rough note with a fast throb',
    make: () => sketch(level('poison'), [
      L('buzz', { length: 0.4, hold: 0.15, pitch: { from: 180, to: 120 }, filters: [{ type: 'lowpass', cutoff: steady(900) }], pulse: { rate: 18, depth: 0.7 } }),
    ]),
  },
  {
    id: 'teleport', label: 'Teleport', group: 'Magic', hint: 'A note and a whoosh sweeping far upward, with long echoes',
    make: () => sketch(level('teleport'), [
      { name: 'Sweep', source: 'tone', wave: 'sine', start: 0, length: 0.5, level: 0.14, attack: 0.05, hold: 0.2, floor: 0.2, tail: 0.06, pitch: { from: 300, to: 2400 } },
      L('whoosh', { length: 0.5, level: 0.3, attack: 0.2, filters: [band(500, 3000, 0.9)] }),
    ], { time: 0.11, repeats: 4, fade: 0.5 }),
  },
  { id: 'zap', label: 'Zap', group: 'Magic', hint: 'A rough falling note with a wobble', make: () => sketch(level('zap'), [L('buzz', { vibrato: { rate: 28, depth: 60 } })]) },

  // ---- world
  {
    id: 'door', label: 'Heavy door', group: 'World', hint: 'A long low rumble that ends in a thud',
    make: () => sketch(level('door'), [L('rumble', { length: 0.5 }), L('thud', { start: 0.42, length: 0.16, pitch: { from: 110, to: 50, arriveAt: 0.08 } })]),
  },
  {
    id: 'lever', label: 'Lever', group: 'World', hint: 'Click, a low knock, click',
    make: () => sketch(level('lever'), [
      L('click'),
      { name: 'Knock', source: 'tone', wave: 'sine', start: 0.01, length: 0.06, level: 0.4, attack: 0.002, hold: 0, floor: 0.02, tail: 0.01, pitch: { from: 150, to: 110 } },
      L('click', { name: 'Second click', start: 0.09, level: 0.4 }),
    ]),
  },
  {
    id: 'coin', label: 'Coin', group: 'World', hint: 'Two bright hollow notes, the second ringing on',
    make: () => sketch(level('coin'), [
      L('blip', { name: 'First note', length: 0.07, pitch: steady(note('B', 5)) }),
      L('blip', { name: 'Second note', start: 0.07, length: 0.3, hold: 0.02, floor: 0.02, pitch: steady(note('E', 6)) }),
    ]),
  },
  {
    id: 'keys', label: 'Keys', group: 'World', hint: 'Three small chimes, not quite in order',
    make: () => sketch(level('keys'), [
      L('chime', { name: 'Key 1', length: 0.12, pitch: steady(note('C', 7)) }),
      L('chime', { name: 'Key 2', start: 0.05, length: 0.12, pitch: steady(note('E', 7)) }),
      L('chime', { name: 'Key 3', start: 0.11, length: 0.2, pitch: steady(note('D', 7)) }),
    ]),
  },
  {
    id: 'chest', label: 'Chest opens', group: 'World', hint: 'A slow creak, then a chime',
    make: () => sketch(level('chest'), [
      {
        name: 'Creak', source: 'tone', wave: 'sawtooth', start: 0, length: 0.35, level: 0.12, attack: 0.04, hold: 0.15, floor: 0.2, tail: 0.05,
        pitch: { from: 110, to: 170 }, filters: [{ type: 'lowpass', cutoff: steady(700) }], tremble: { rate: 20, depth: 12, seed: 0.6 },
      },
      L('chime', { start: 0.3 }),
    ]),
  },
  {
    id: 'plate', label: 'Pressure plate', group: 'World', hint: 'A dull click over a low thud',
    make: () => sketch(level('plate'), [L('click', { level: 0.4 }), L('thud', { length: 0.1, pitch: { from: 110, to: 70, arriveAt: 0.05 } })]),
  },

  // ---- outcome
  {
    id: 'fanfare', label: 'Victory fanfare', group: 'Outcome', hint: 'A horn climbing four notes and holding the last',
    make: () => sketch(level('fanfare'), [
      L('horn', { name: 'Horn 1', length: 0.14, hold: 0.06, pitch: steady(note('G', 4)) }),
      L('horn', { name: 'Horn 2', start: 0.13, length: 0.14, hold: 0.06, pitch: steady(note('C', 5)) }),
      L('horn', { name: 'Horn 3', start: 0.26, length: 0.14, hold: 0.06, pitch: steady(note('E', 5)) }),
      L('horn', { name: 'Horn 4', start: 0.39, length: 0.65, hold: 0.35, pitch: steady(note('G', 5)) }),
    ]),
  },
  {
    id: 'defeat', label: 'Defeat', group: 'Outcome', hint: 'Strings stepping down three notes and fading',
    make: () => sketch(level('defeat'), [
      L('strings', { name: 'Strings 1', length: 0.3, attack: 0.06, hold: 0.14, tail: 0.08, pitch: steady(note('E', 4)) }),
      L('strings', { name: 'Strings 2', start: 0.24, length: 0.3, attack: 0.06, hold: 0.14, tail: 0.08, pitch: steady(note('C', 4)) }),
      L('strings', { name: 'Strings 3', start: 0.48, length: 0.8, attack: 0.06, pitch: steady(note('A', 3)) }),
    ]),
  },
  {
    id: 'life-lost', label: 'Life lost', group: 'Outcome', hint: 'A note sliding down into a thud',
    make: () => sketch(level('life-lost'), [
      { name: 'Slide', source: 'tone', wave: 'sine', start: 0, length: 0.35, level: 0.16, attack: 0.01, hold: 0.1, floor: 0.2, tail: 0.05, pitch: { from: 520, to: 200 } },
      L('thud', { start: 0.3 }),
    ]),
  },
];

export const SOUND_GROUPS: readonly SoundGroup[] = ['Blank', 'Interface', 'Combat', 'Magic', 'World', 'Outcome'];

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
