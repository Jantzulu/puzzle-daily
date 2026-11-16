// The page furniture's sounds, as data (types.ts). These ship with the game.
// They are the six sounds the user tuned by ear on 2026-11-14/15, moved
// here number for number from the hand-written recipes they started as; the
// notes on each record what the user's ear said along the way, because
// those are the rules for making more.
//
// To change one: edit it in the Sound Forge (Editors > Sound Forge), then
// hand the copied recipe to whoever updates this file. The Forge can also
// keep an edited copy on the device to hear it in the game first
// (chromeSounds.ts looks for one before using these).

import type { SynthLayer, SynthSound } from './types';

export type BuiltInSoundId =
  | 'torch-out'
  | 'torch-lit'
  | 'scroll-roll'
  | 'scroll-unroll'
  | 'scroll-land'
  | 'scroll-sparkle'
  | 'gate-rumble'
  | 'gate-rung'
  | 'gate-land'
  | 'gate-lock';

export interface BuiltInSound {
  id: BuiltInSoundId;
  name: string;
  /** Where the game plays it. */
  where: string;
  sound: SynthSound;
}

/** A noise layer with the common fade (to 5% of its peak, then a 0.05s tail). */
const air = (layer: Partial<SynthLayer> & Pick<SynthLayer, 'id' | 'name' | 'length' | 'level' | 'attack'>): SynthLayer => ({
  source: 'noise',
  start: 0,
  hold: 0,
  floor: 0.05,
  tail: 0.05,
  ...layer,
});

// ---- torch-out: a torch snuffed ----------------------------------------------
//   woosh    the flame going: a breath of air that swells and falls away
//   hiss     the ember sizzling out: a thin high hiss that fades
//   pops     three tiny pops in the tail, barely there
// The user's ear:
//   v1 opened with a low thump: "a knock", heavier than a torch going out.
//      So nothing starts abruptly: both noise layers rise from silence.
//   v2: "sand falling onto a hard surface", too intense: hiss and pops
//      became much quieter.
//   v3 dropped the hiss for two low narrow sweeps: "weird, almost robotic".
//      Narrow bands of noise that slide in pitch are how a synthetic voice
//      is made. Keep the noise BROAD.
//   v4: the right kind of sound, "but as if made 300% more intense", and the
//      opening "like somebody sweeping debris on the floor". So it is about
//      a third as loud, and the woosh is short and only FALLS in pitch (a
//      rise-then-fall is the gesture of a broom stroke).
//   v5 (this): "sounds great! Even on mobile!" Its level is the reference
//      for every other page sound.
const pop = (n: number, start: number): SynthLayer => ({
  id: `pop-${n}`,
  name: `Pop ${n}`,
  source: 'noise',
  start,
  length: 0.006,
  level: 0.1,
  attack: 0,
  hold: 0.006,
  floor: 1,
  tail: 0,
  noiseSeed: 0.11 * n,
  filters: [{ type: 'highpass', cutoff: { from: 1800, to: 1800 } }],
});

const torchOut: SynthSound = {
  version: 1,
  level: 0.22,
  layers: [
    air({
      id: 'woosh', name: 'Woosh', length: 0.3, level: 0.6, attack: 0.1, noiseSeed: 0,
      filters: [{ type: 'bandpass', q: 1, cutoff: { from: 950, via: { value: 1000, at: 0.1 }, to: 450 } }],
    }),
    air({
      id: 'hiss', name: 'Hiss', length: 0.55, level: 0.36, attack: 0.12, hold: 0.06, noiseSeed: 1.1,
      filters: [{ type: 'bandpass', q: 0.8, cutoff: { from: 5400, to: 2600 } }],
    }),
    pop(1, 0.24),
    pop(2, 0.33),
    pop(3, 0.45),
  ],
};

// ---- torch-lit: a torch catching ----------------------------------------------
// The mirror of torch-out at the same quiet level: a soft breath that swells
// while its pitch RISES (the flame taking), under a faint high hiss. No pops.
const torchLit: SynthSound = {
  version: 1,
  level: 0.28,
  layers: [
    air({
      id: 'woosh', name: 'Woosh', length: 0.34, level: 0.6, attack: 0.12, noiseSeed: 0.6,
      filters: [{ type: 'bandpass', q: 1, cutoff: { from: 480, to: 1000 } }],
    }),
    air({
      id: 'hiss', name: 'Hiss', length: 0.42, level: 0.18, attack: 0.14, noiseSeed: 1.3,
      filters: [{ type: 'bandpass', q: 0.8, cutoff: { from: 3000, to: 4400 } }],
    }),
  ],
};

// ---- scroll-roll / scroll-unroll: the quest scroll's parchment ----------------
// A SWOOSH with a little paper in it: one broad band of noise that swells and
// falls with the roll's speed while its tone slides (up as the scroll opens,
// down as it rolls shut), with a fast, shallow tremble so it is a sheet
// moving and not just air.
// The user's ear on v1 (a small slide and a slow, deep, irregular wobble in
// loudness): "very creaky, and could maybe do with more of a swoosh". The
// slow deep wobble was the creak. v2 (this): "it sounds better!"
// The lengths match index.css (.quest-closing 0.5s, the unfurl 0.65s).
const scrollPaper = (length: number, from: number, to: number, noiseSeed: number, trembleSeed: number): SynthSound => ({
  version: 1,
  level: 0.2,
  layers: [
    air({
      id: 'swoosh', name: 'Swoosh', length, level: 0.5, attack: length * 0.4, noiseSeed,
      filters: [{ type: 'bandpass', q: 0.9, cutoff: { from, to } }],
      tremble: { rate: 90, depth: 5, seed: trembleSeed },
    }),
  ],
});

// ---- scroll-land: the rolled scroll pressed onto the board ---------------------
//   thump  a very low, very short note: the weight, felt more than heard
//   smack  a short burst of BROAD noise: wood and parchment meeting stone
// This one IS a real impact, so it starts at once. The user's ear on v1 (a
// note falling from 150 Hz that rang 0.16s, over a narrow band at 900 Hz):
// "a little less hollow box sounding". A ringing low note plus a boxy middle
// is a knock on a crate. Phone speakers cannot play the thump; the smack is
// what carries there.
const scrollLand: SynthSound = {
  version: 1,
  level: 0.16,
  layers: [
    {
      id: 'thump', name: 'Thump', source: 'tone', wave: 'sine',
      start: 0, length: 0.085, level: 0.45, attack: 0.003, hold: 0, floor: 0.02, tail: 0.015,
      pitch: { from: 92, to: 46, arriveAt: 0.085 * 0.6 },
    },
    {
      id: 'smack', name: 'Smack', source: 'noise',
      start: 0, length: 0.05, level: 1.6, attack: 0.001, hold: 0, floor: 0.02, tail: 0.01,
      noiseSeed: 1.6,
      filters: [
        { type: 'highpass', cutoff: { from: 420, to: 420 } },
        { type: 'lowpass', cutoff: { from: 3400, to: 3400 } },
      ],
    },
  ],
};

// ---- scroll-sparkle: the quest is important ------------------------------------
// When a quest FIRST unfurls on a puzzle, a little run of bright glints rises
// over the swoosh (user ask: "a sparkling or magical effect ... this thing
// (the quest) is important!"). Each glint is a clear high note that starts
// softly and rings away, with a fainter, slightly sour partner above it
// (what makes a note a small bell and not a beep). The notes climb a major
// chord: G6 B6 D7 G7 B7. Clear tones are far louder to the ear than noise at
// the same level, so this sits at about half the noise sounds' level.
const SPARKLE_NOTES = [1568, 1976, 2349, 3136, 3951];
const scrollSparkle: SynthSound = {
  version: 1,
  level: 0.035,
  layers: SPARKLE_NOTES.map((hz, i): SynthLayer => ({
    id: `glint-${i + 1}`,
    name: `Glint ${i + 1}`,
    source: 'tone',
    wave: 'sine',
    start: i * 0.06,
    length: 0.42,
    // Later, higher glints are a little quieter: the run fades as it climbs.
    level: 1 - i * 0.12,
    attack: 0.006,
    hold: 0,
    floor: 0.01,
    tail: 0.03,
    pitch: { from: hz, to: hz },
    overtone: { ratio: 2.76, level: 0.22 },
  })),
};

// ---- the portcullis (the menu gate) ----------------------------------------------
// User ask 2026-11-15: sounds for the gate lowering and rising that match
// how long the move takes and how many rungs it has, with final sounds for
// landing and for locking at the top. The gate's motion is already exact
// (index.css: it creeps, falls, HITS at 86% of 1.4s and rebounds twice; it
// is winched up in four ratchet pulls and locks at 1.25s), so these are
// PARTS, and utils/gateSounds.ts plays them at those same moments:
//   gate-rumble  the iron moving: a low grind under a clattering chain.
//                Made one second long and stretched to fit each move.
//   gate-rung    one rung passing: an iron clank. Played once per rung as
//                it comes out from (or goes back under) the bar.
//   gate-land    the gate hitting the ground: the big one.
//   gate-lock    the gate locking at the top: a clunk, a clang and a latch.
//
// THE USER'S EAR, three rounds (2026-11-15):
//   v1  "way too high pitched and kind of silly for an enormous iron door".
//       Small bright parts: a 1250 Hz ring with two overtones is a little
//       bell.
//   v2  low and dull, nothing above 1 kHz: "the pitch is better, but it
//       doesnt really give the effect of metal clanking ... just thudding".
//   v3  (this) "This should probably be the most jarring sound effect of
//       them all, as this is generally violent, noisy, and abrasive in
//       real life."
// WHAT MAKES IT METAL AND NOT A THUD (keep all four):
//   1. many notes at once that CLASH: stacked notes at in-between ratios
//      (2.76, 5.4, 8.93 are how a struck bar rings; 1.48, 2.31, 3.9, 5.6
//      crowd in between)
//   2. the ringing notes hold their pitch: a note that drops is a drum
//   3. it rings ON: half a second to over a second, not a tenth
//   4. a hard, bright strike at the very start
// WHAT MAKES IT BIG AND NOT SILLY: a LOW main note under all those clashing
// overtones, and a long ring. Size is not the absence of highs.
// Each sound therefore has: a low note that drops (the weight; a phone
// cannot play it), a low RING, a higher rougher BITE (a hollow wave, so it
// is dense with overtones), and a STRIKE of bright noise.
// Levels were set by measuring; nobody has heard these.
const gateRumble: SynthSound = {
  version: 1,
  level: 0.15,
  layers: [
    {
      id: 'rumble', name: 'Rumble', source: 'noise', start: 0, length: 1, level: 1.4, attack: 0.55, hold: 0.35, floor: 0.7, tail: 0.06,
      noiseSeed: 0.8, filters: [{ type: 'lowpass', cutoff: { from: 110, to: 170 } }],
      tremble: { rate: 14, depth: 6, seed: 0.3 },
    },
    {
      id: 'grind', name: 'Grind', source: 'noise', start: 0, length: 1, level: 0.5, attack: 0.55, hold: 0.35, floor: 0.7, tail: 0.06,
      noiseSeed: 1.5, filters: [{ type: 'bandpass', q: 0.7, cutoff: { from: 360, to: 520 } }],
      tremble: { rate: 11, depth: 10, seed: 1.1 },
    },
    {
      id: 'chain', name: 'Chain', source: 'tone', wave: 'square', start: 0, length: 1, level: 0.05, attack: 0.5, hold: 0.4, floor: 0.7, tail: 0.06,
      pitch: { from: 610, to: 610 }, harmonics: [{ ratio: 1.48, level: 0.6 }, { ratio: 2.31, level: 0.5 }, { ratio: 3.9, level: 0.35 }],
      pulse: { rate: 17, depth: 0.95 }, tremble: { rate: 30, depth: 8, seed: 0.5 },
    },
  ],
};

const gateRung: SynthSound = {
  version: 1,
  level: 0.16,
  layers: [
    {
      id: 'strike', name: 'Strike', source: 'noise', start: 0, length: 0.014, level: 0.9, attack: 0, hold: 0, floor: 0.02, tail: 0.004,
      noiseSeed: 0.5, filters: [{ type: 'highpass', cutoff: { from: 1700, to: 1700 } }],
    },
    {
      id: 'weight', name: 'Weight', source: 'tone', wave: 'sine', start: 0, length: 0.09, level: 0.35, attack: 0.002, hold: 0, floor: 0.02, tail: 0.02,
      pitch: { from: 115, to: 78, arriveAt: 0.05 },
    },
    {
      id: 'ring', name: 'Ring', source: 'tone', wave: 'sine', start: 0, length: 0.34, level: 0.26, attack: 0.001, hold: 0, floor: 0.015, tail: 0.04,
      pitch: { from: 131, to: 131 }, harmonics: [{ ratio: 2.76, level: 0.55 }, { ratio: 5.4, level: 0.35 }, { ratio: 8.93, level: 0.2 }],
    },
    {
      id: 'bite', name: 'Bite', source: 'tone', wave: 'square', start: 0, length: 0.2, level: 0.1, attack: 0.001, hold: 0, floor: 0.02, tail: 0.03,
      pitch: { from: 262, to: 262 }, harmonics: [{ ratio: 1.48, level: 0.6 }, { ratio: 2.31, level: 0.45 }, { ratio: 3.9, level: 0.3 }, { ratio: 5.6, level: 0.2 }],
    },
  ],
};

const gateLand: SynthSound = {
  version: 1,
  level: 0.28,
  echo: { time: 0.07, repeats: 2, fade: 0.3 },
  layers: [
    {
      id: 'strike', name: 'Strike', source: 'noise', start: 0, length: 0.022, level: 1.3, attack: 0, hold: 0, floor: 0.02, tail: 0.006,
      noiseSeed: 1.2, filters: [{ type: 'highpass', cutoff: { from: 1500, to: 1500 } }],
    },
    {
      id: 'thump', name: 'Thump', source: 'tone', wave: 'sine', start: 0, length: 0.34, level: 0.7, attack: 0.003, hold: 0, floor: 0.02, tail: 0.05,
      pitch: { from: 62, to: 32, arriveAt: 0.16 },
    },
    {
      id: 'crash', name: 'Crash', source: 'noise', start: 0, length: 0.3, level: 0.7, attack: 0.001, hold: 0, floor: 0.03, tail: 0.05,
      noiseSeed: 1.6, filters: [{ type: 'bandpass', q: 0.5, cutoff: { from: 2200, to: 900 } }],
      tremble: { rate: 26, depth: 9, seed: 0.7 },
    },
    {
      id: 'ring', name: 'Ring', source: 'tone', wave: 'sine', start: 0, length: 1.3, level: 0.3, attack: 0.001, hold: 0, floor: 0.01, tail: 0.1,
      pitch: { from: 98, to: 98 }, harmonics: [{ ratio: 1.51, level: 0.5 }, { ratio: 2.76, level: 0.6 }, { ratio: 5.4, level: 0.45 }, { ratio: 8.93, level: 0.3 }],
    },
    {
      id: 'bite', name: 'Bite', source: 'tone', wave: 'square', start: 0, length: 0.45, level: 0.13, attack: 0.001, hold: 0, floor: 0.01, tail: 0.05,
      pitch: { from: 415, to: 415 }, harmonics: [{ ratio: 1.48, level: 0.6 }, { ratio: 2.31, level: 0.5 }, { ratio: 3.9, level: 0.35 }, { ratio: 5.6, level: 0.25 }],
    },
  ],
};

const gateLock: SynthSound = {
  version: 1,
  level: 0.24,
  layers: [
    {
      id: 'strike', name: 'Strike', source: 'noise', start: 0, length: 0.016, level: 1, attack: 0, hold: 0, floor: 0.02, tail: 0.005,
      noiseSeed: 0.4, filters: [{ type: 'highpass', cutoff: { from: 1500, to: 1500 } }],
    },
    {
      id: 'clunk', name: 'Clunk', source: 'tone', wave: 'sine', start: 0, length: 0.16, level: 0.65, attack: 0.002, hold: 0, floor: 0.02, tail: 0.03,
      pitch: { from: 92, to: 54, arriveAt: 0.08 },
    },
    {
      id: 'ring', name: 'Ring', source: 'tone', wave: 'sine', start: 0, length: 0.65, level: 0.24, attack: 0.001, hold: 0, floor: 0.01, tail: 0.06,
      pitch: { from: 147, to: 147 }, harmonics: [{ ratio: 2.76, level: 0.55 }, { ratio: 5.4, level: 0.4 }, { ratio: 8.93, level: 0.25 }],
    },
    {
      id: 'bite', name: 'Bite', source: 'tone', wave: 'square', start: 0, length: 0.26, level: 0.1, attack: 0.001, hold: 0, floor: 0.015, tail: 0.04,
      pitch: { from: 523, to: 523 }, harmonics: [{ ratio: 1.48, level: 0.55 }, { ratio: 2.31, level: 0.4 }, { ratio: 3.9, level: 0.3 }],
    },
    {
      id: 'latch', name: 'Latch', source: 'noise', start: 0.07, length: 0.02, level: 0.8, attack: 0, hold: 0, floor: 0.02, tail: 0.006,
      noiseSeed: 1.2,
      filters: [
        { type: 'highpass', cutoff: { from: 900, to: 900 } },
        { type: 'lowpass', cutoff: { from: 5000, to: 5000 } },
      ],
    },
  ],
};

export const BUILT_IN_SOUNDS: readonly BuiltInSound[] = [
  { id: 'torch-out', name: 'Torch goes out', where: 'A lintel torch is put out, by a tap or a lost run', sound: torchOut },
  { id: 'torch-lit', name: 'Torch lights', where: 'A lintel torch is lit, by a tap or a retry', sound: torchLit },
  { id: 'scroll-roll', name: 'Scroll rolls up', where: 'The quest scroll rolls shut (0.5s)', sound: scrollPaper(0.5, 2700, 1250, 1.2, 0.2) },
  { id: 'scroll-unroll', name: 'Scroll unfurls', where: 'The quest scroll opens (0.65s)', sound: scrollPaper(0.65, 1150, 2900, 0.1, 0.9) },
  { id: 'scroll-land', name: 'Scroll lands', where: 'The rolled scroll presses onto the board', sound: scrollLand },
  { id: 'scroll-sparkle', name: 'Quest sparkle', where: 'A quest unfurls for the first time on a puzzle', sound: scrollSparkle },
  { id: 'gate-rumble', name: 'Gate moves', where: 'The menu gate is lowering or rising (stretched to fit the move)', sound: gateRumble },
  { id: 'gate-rung', name: 'Gate rung', where: 'One rung of the menu gate passes the bar (once per rung)', sound: gateRung },
  { id: 'gate-land', name: 'Gate lands', where: 'The menu gate hits the ground', sound: gateLand },
  { id: 'gate-lock', name: 'Gate locks', where: 'The menu gate locks at the top', sound: gateLock },
];

export function builtInSound(id: BuiltInSoundId): SynthSound {
  return BUILT_IN_SOUNDS.find(s => s.id === id)!.sound;
}
