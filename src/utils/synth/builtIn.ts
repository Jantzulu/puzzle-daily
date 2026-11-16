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
//   gate-rung    one rung passing: an iron clank. Played once per rung.
//   gate-land    the gate hitting the ground: the big one.
//   gate-lock    the gate locking at the top.
//
// THE USER'S EAR, four rounds (2026-11-15):
//   v1  "way too high pitched and kind of silly for an enormous iron door"
//   v2  low and dull: "the pitch is better, but ... just thudding"
//   v3  low ring + a square-wave "bite": still "missing the mark"; "it
//       should sound more like noises a blacksmith would make on an anvil".
//   v4  (this) is built from a MEASUREMENT, since nobody writing these can
//       hear them.
//
// THE MEASUREMENT. A real recording of a smith hammering on an anvil
// ("WWS Blacksmith's anvil", Work With Sounds / La Fonderie, CC BY 4.0, on
// Wikimedia Commons), 24 of its strikes averaged:
//   - it reaches full loudness in 2 ms, is 20 dB down at 200 ms and 40 dB
//     down at 470 ms
//   - over 90% of the ring is between 1.5 and 4 kHz; almost none is low
//   - it is a handful of pure notes, each fading at its own rate:
//       main note      1890 Hz   loudest          fades 103 dB a second
//       x 1.12         2116 Hz   -11 dB           fades  68 dB/s: it
//                                                 OUTLASTS the main note
//                                                 and is what lingers
//       x 1.50         2842 Hz   -16 dB           135 dB/s
//       x 1.85         3499 Hz   -20 dB           140 dB/s
//       x 2.73, 3.21   5168, 6062 Hz  -21 dB      about 160 dB/s
//       x 0.157        296 Hz    -11 dB           gone in 100 ms: the
//                                                 hammer's own thock
//   - the first 30 ms also carry a splash of noise from 4 to 10 kHz
// So an anvil is neither a low boom (v2, v3) nor a tick with a bell on it
// (v1): it is a tight cluster of PURE notes close enough to clash, that
// start at once and ring for half a second. Pure matters: a square or
// sawtooth wave adds evenly spaced overtones, which is a buzz, not metal.
//
// clang() below is that structure. `note` is the main note of the cluster
// and `ring` stretches how long it lasts (a bigger piece of iron rings
// longer). THE CLANGS STAY HIGH (user, the same day: "the portcullis would
// have low undertones of the whole door moving and rumbling, but the
// clangs would be high pitched"): the size of the gate is carried by the
// low rumble, the grind and the landing's low note, NOT by pitching the
// clangs down. Levels were set by measuring; nobody has heard these.

/** One strike on iron, built from the anvil measurement (see above). */
const clang = (note: number, ring: number): SynthLayer[] => {
  /** A layer that starts at once and fades to 1% of itself over `seconds`. */
  const partial = (id: string, name: string, hz: number, level: number, seconds: number, harmonics?: SynthLayer['harmonics']): SynthLayer => ({
    id, name, source: 'tone', wave: 'sine', start: 0, length: seconds * ring, level, attack: 0.002, hold: 0, floor: 0.01, tail: 0.02 * ring,
    pitch: { from: hz, to: hz }, ...(harmonics ? { harmonics } : {}),
  });
  return [
    {
      id: 'strike', name: 'Strike', source: 'noise', start: 0, length: 0.03, level: 2, attack: 0, hold: 0, floor: 0.02, tail: 0.008,
      noiseSeed: 0.5, filters: [{ type: 'bandpass', q: 0.8, cutoff: { from: note * 3.4, to: note * 3.4 } }],
    },
    // The hammer's own thock: low, and over almost at once.
    { ...partial('thock', 'Thock', note * 0.157, 0.5, 0.12, [{ ratio: 0.634, level: 0.35 }]), floor: 0.03 },
    partial('ring', 'Ring', note, 1, 0.41),
    // The note that lingers: quieter than the main one, but it outlasts it.
    partial('sing', 'Sing', note * 1.12, 0.29, 0.62),
    // The upper notes, which are the brightness of the first moment.
    partial('shine', 'Shine', note * 1.504, 0.17, 0.3, [{ ratio: 1.231, level: 0.63 }, { ratio: 1.818, level: 0.49 }, { ratio: 2.132, level: 0.62 }]),
  ];
};

const gateRumble: SynthSound = {
  version: 1,
  level: 0.13,
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
      id: 'chain', name: 'Chain', source: 'tone', wave: 'sine', start: 0, length: 1, level: 0.05, attack: 0.5, hold: 0.4, floor: 0.7, tail: 0.06,
      pitch: { from: 2100, to: 2100 }, harmonics: [{ ratio: 1.12, level: 0.5 }, { ratio: 1.504, level: 0.35 }, { ratio: 1.851, level: 0.25 }],
      pulse: { rate: 17, depth: 0.95 }, tremble: { rate: 30, depth: 8, seed: 0.5 },
    },
  ],
};

// One rung: a strike on a bar of the gate. The anvil's cluster, a touch
// lower than the anvil itself (1700 Hz against 1890), ringing a little longer.
const gateRung: SynthSound = {
  version: 1,
  level: 0.041,
  layers: clang(1700, 1.1),
};

// The landing: the whole gate struck at once. A little lower and ringing
// nearly twice as long, over a low note for its weight and a crash of
// noise, with two short echoes off the stone.
const gateLand: SynthSound = {
  version: 1,
  level: 0.11,
  echo: { time: 0.07, repeats: 2, fade: 0.3 },
  layers: [
    {
      id: 'thump', name: 'Thump', source: 'tone', wave: 'sine', start: 0, length: 0.34, level: 0.9, attack: 0.003, hold: 0, floor: 0.02, tail: 0.05,
      pitch: { from: 62, to: 32, arriveAt: 0.16 },
    },
    {
      id: 'crash', name: 'Crash', source: 'noise', start: 0, length: 0.22, level: 0.5, attack: 0.001, hold: 0, floor: 0.03, tail: 0.04,
      noiseSeed: 1.6, filters: [{ type: 'bandpass', q: 0.5, cutoff: { from: 2600, to: 1100 } }],
    },
    ...clang(1480, 1.8),
  ],
};

// The lock: the gate meeting its upper stop. Between the two in size.
const gateLock: SynthSound = {
  version: 1,
  level: 0.076,
  layers: [
    {
      id: 'clunk', name: 'Clunk', source: 'tone', wave: 'sine', start: 0, length: 0.16, level: 0.7, attack: 0.002, hold: 0, floor: 0.02, tail: 0.03,
      pitch: { from: 92, to: 54, arriveAt: 0.08 },
    },
    ...clang(1600, 1.4),
    {
      id: 'latch', name: 'Latch', source: 'noise', start: 0.07, length: 0.02, level: 0.5, attack: 0, hold: 0, floor: 0.02, tail: 0.006,
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
