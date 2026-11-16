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
  | 'gate-lock'
  | 'sign-creak';

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
//   gate-rumble  the winch chugging while the gate moves. Made one second
//                long and stretched to fit each move.
//   gate-rung    one rung passing: a clack. Played once per rung.
//   gate-land    the crash: the gate hitting the ground, and (a touch
//                smaller) slamming home at the top.
//   gate-lock    the smaller knock: the two rebounds after the crash, the
//                page-load settle, a grabbed gate.
//
// THE USER'S EAR, seven rounds (2026-11-15):
//   v1  "way too high pitched and kind of silly for an enormous iron door"
//   v2  low and dull: "the pitch is better, but ... just thudding"
//   v3  low ring + a square-wave "bite": still "missing the mark"; "it
//       should sound more like noises a blacksmith would make on an anvil".
//   v4  fitted to a measured recording of an ANVIL (pure notes around
//       1.5-2 kHz). The user then supplied a recording of a real heavy gate:
//       "has the sounds I had in mind ... the screech is too much, but the
//       chugging sound of the winch being lowered with the crash is very
//       close".
//   v5  fitted to THAT recording. "definitely an improvement!", but: the
//       sound at the top "does not sound like the fully open crash, and
//       they should be similar"; on headphones "it still seems to lack the
//       bassy oomph of the audio file"; and "the chugging seems almost too
//       rapid given the context of the speed of the portcullis".
//   v6  more bass, a slower throb, the crash at the top too (THE BASS
//       below). "the chugging sounds like an electric motor".
//   v7  (this): see THE MOTOR below. Nobody writing these can hear them;
//       every number is measured, then the rendered sound was measured
//       the same way and compared.
//
// THE MEASUREMENT (the user's clip, "gate heavy open/close", a Freesound
// community recording; only numbers were taken from it, and its opening
// screech, a 1550 Hz whistle, was left out on the user's word):
//   THE CHUG (the winch, about 3 s of it)
//   - it is nearly as loud as the crash: typically 8 dB under it
//   - the low end throbs 17 times a second (very regular), on a low note
//     of 86 Hz with 172 and 269 Hz above it
//   - the bright end (above 1.5 kHz) clacks about 7 times a second
//   - where its energy is: 30% under 150 Hz, 30% 150-500, 7% 500-1500,
//     18% 1.5-4 kHz, 16% above 4 kHz
//   ONE CLACK in it: 45% of it between 1.5 and 4 kHz, a small cluster of
//     pure notes at 2229, 2713, 2875, 3295 and 3531 Hz, over a low knock
//     (108 and 194 Hz)
//   THE CRASH
//   - NOT a high clang: 73% of it is between 150 and 500 Hz, 19% between
//     500 and 1500, almost nothing above
//   - it takes 10 ms to arrive and 50 ms to peak, then HANGS: still within
//     2 dB at 140 ms, 6 dB down at 400 ms, 14 dB at 800 ms, 23 dB at 1.5 s,
//     30 dB at 1.8 s
//   - its body is three pure notes close enough to grind on each other:
//     247 Hz (the one that lasts), 291 Hz (as loud at first, gone sooner)
//     and about 172 Hz, with 108 and 65 Hz under them, and a rattle of
//     noise around 400-700 Hz
//   A SMALLER CLANK, a second after the crash, a quarter of its size:
//     brighter, its main note 495 Hz with 366, 689 and 904 Hz and a short
//     bite of noise from 2 to 3 kHz
// What the rendered sounds measure against that: the chug throbs 17.4 and
// clacks 7.0 times a second, energy 34/27/6/15/17%; the crash is 69% in
// 150-500 Hz and 6 dB down at 350 ms, 14 dB at 800 ms, 28 dB at 1.5 s.
//
// THE BASS (v6). v5 matched the clip in five WIDE bands, and "under 150 Hz"
// hid the problem. Measured in narrow bands, as loudness next to the clip's
// own: v5's crash had 31% of the clip's level around 250 Hz but only 5-19%
// from 45 to 100 Hz, and v5's chug had 6-17% below 70 Hz. The clip's crash
// carries notes at 69, 92 and 116 Hz almost as strong as its 250 Hz body,
// and its chug is full of rumble from 20 to 80 Hz. v6 adds a Sub layer to
// each and now measures 44-47% of the clip from 45 to 150 Hz in the crash
// and about 50% below 270 Hz in the chug, against about 30% above: tilted
// toward the bass ON PURPOSE, because the game plays quieter than the clip
// and low notes are the first thing the ear loses at a lower volume.
// LESSON: compare a made sound with a recording in NARROW bands and in
// absolute level, not in shares of a few wide bands.
//
// THE MOTOR (v7). v6 slowed the low throb from 17 to 9 a second (the user
// had heard 17 as too fast for a gate that moves for 1.2 s) and the user
// heard "an electric motor". Three new yardsticks, the clip's winch against
// v6's, say why:
//   DOES THE PITCH HOLD STILL? The strongest low notes, looked at five
//     times a second. The clip's wander: 75, 86, 102, 129 Hz and back, and
//     135 to 275 Hz above them. v6's were 38, 86 and 269 Hz in every look.
//   DOES IT KEEP TIME? How much of the low end's swelling happens at its
//     one strongest rate. The clip: 6%. v6: about 60% (a pulse at exactly
//     9 a second). The gaps between swells vary by 80% in the clip, by 9%
//     in v6.
//   WHAT SHAPE IS A SWELL? The clip is a steady bed with short bumps on
//     it: between bumps it stays at 70% of their height. v6 fell to 25%
//     between swells, the whole low end rising and falling smoothly.
// A steady pitch swelling smoothly in strict time is what a motor IS. And
// in the clip the bright clacks (about 7 a second, 0.08 to 0.28 s apart)
// do not move the low end at all: the chug is a rumble with clacks on top,
// not a low note that throbs. ("throbs 17 times a second (very regular)"
// above overstated it: that is a roughness, a fifth of the swelling.)
// v7's winch is therefore ALL NOISE and keeps no time: each low layer is
// noise squeezed into a narrow band, which has a pitch but cannot hold it,
// with its own slow irregular swell; the rhythm is the rungs' clacks. It
// measures: pitch wandering (48-70, 75-129, 172-323 Hz), 5% at the
// strongest rate, gaps varying by 60%, a bed at 70%; and still about 50%
// of the clip's level below 270 Hz and 35-40% above.
// LESSON: band levels say how much of each pitch there is, not how it
// behaves in time. Also ask: does the pitch move, does it keep time, and
// what shape is one swell.
//
// So the size of this gate is a low BOOM that hangs in the air, and the
// "metal" is in the clacks and the rattle on top. Earlier notes said the
// clangs should be high; the user's own recording says the crash is low
// and only the clacks are bright, and the recording wins.

/** A pure note that starts almost at once and fades to 3% of itself. */
const gateNote = (id: string, name: string, hz: number, level: number, seconds: number, more: Partial<SynthLayer> = {}): SynthLayer => ({
  id, name, source: 'tone', wave: 'sine', start: 0, length: seconds, level, attack: 0.012, hold: 0, floor: 0.03, tail: Math.min(0.3, seconds * 0.15),
  pitch: { from: hz, to: hz }, ...more,
});

/** A burst or bed of noise kept to one band. */
const gateNoise = (id: string, name: string, level: number, seconds: number, filters: SynthLayer['filters'], more: Partial<SynthLayer> = {}): SynthLayer => ({
  id, name, source: 'noise', start: 0, length: seconds, level, attack: 0.004, hold: 0, floor: 0.03, tail: Math.min(0.1, seconds * 0.2),
  noiseSeed: 0.5, filters, ...more,
});

const band = (hz: number, q: number) => ({ type: 'bandpass' as const, q, cutoff: { from: hz, to: hz } });
const below = (hz: number) => ({ type: 'lowpass' as const, cutoff: { from: hz, to: hz } });

// The winch. Every layer swells in over the first quarter (the gate creeps
// before it falls) and then holds. ALL NOISE, and nothing in it keeps time
// (see THE MOTOR above): no notes, no pulse. The four low layers are slowed
// noise squeezed into narrow bands, so each has a pitch that drifts, and
// each swells slowly on its own. The rhythm of the chug is the rungs'
// clacks, played by gateSounds.ts.
// Levels: the sound's own level is high and the layers low so that every
// number here sits inside the Sound Forge's sliders.
const whileMoving = { attack: 0.25, hold: 0.6, floor: 0.85, tail: 0.05 };
const gateRumble: SynthSound = {
  version: 1,
  level: 0.6,
  layers: [
    // The bottom of it, felt more than heard: headphones and big speakers only.
    gateNoise('sub', 'Sub', 1.6, 1, [band(48, 1.2), below(95)], {
      ...whileMoving, noiseRate: 0.25, noiseSeed: 0.7, tremble: { rate: 4, depth: 20, seed: 0.7 },
    }),
    gateNoise('drone', 'Drone', 1.4, 1, [band(92, 2.5)], {
      ...whileMoving, noiseRate: 0.25, noiseSeed: 0.3, tremble: { rate: 5, depth: 20, seed: 0.3 },
    }),
    gateNoise('growl', 'Growl', 0.85, 1, [band(170, 1.8)], {
      ...whileMoving, noiseRate: 0.25, noiseSeed: 1.3, tremble: { rate: 6, depth: 20, seed: 1.4 },
    }),
    gateNoise('moan', 'Moan', 1.5, 1, [band(265, 5)], {
      ...whileMoving, noiseRate: 0.25, noiseSeed: 1.9, tremble: { rate: 6, depth: 20, seed: 0.2 },
    }),
    gateNoise('rumble', 'Rumble', 0.2, 1, [below(420)], {
      ...whileMoving, noiseSeed: 0.8, tremble: { rate: 6, depth: 20, seed: 1.1 },
    }),
    gateNoise('grind', 'Grind', 0.15, 1, [band(900, 0.7)], {
      ...whileMoving, noiseSeed: 0.35, tremble: { rate: 8, depth: 6, seed: 1.7 },
    }),
    gateNoise('clatter', 'Clatter', 0.19, 1, [band(2700, 0.6)], {
      ...whileMoving, noiseSeed: 1.5, tremble: { rate: 9, depth: 6, seed: 0.5 },
    }),
    // The top of the clatter. Noise in a band, NOT a note: a held high note
    // is the screech the user asked to leave out.
    gateNoise('hiss', 'Hiss', 0.12, 1, [band(4300, 1.5)], {
      ...whileMoving, noiseSeed: 0.2, tremble: { rate: 9, depth: 6, seed: 0.9 },
    }),
  ],
};

// One rung: a clack of the ratchet, louder than the ones in the chug.
const gateRung: SynthSound = {
  version: 1,
  level: 0.1,
  layers: [
    gateNoise('clack', 'Clack', 3, 0.09, [band(2500, 0.7), below(4200)], { attack: 0.001, floor: 0.08, tail: 0.02 }),
    gateNote('ting', 'Ting', 2713, 0.3, 0.16, {
      attack: 0.002, tail: 0.03,
      harmonics: [{ ratio: 0.82, level: 0.45 }, { ratio: 1.06, level: 0.9 }, { ratio: 1.215, level: 0.4 }, { ratio: 1.3, level: 0.4 }],
    }),
    gateNote('knock', 'Knock', 108, 0.8, 0.1, { attack: 0.003, floor: 0.05, tail: 0.03, harmonics: [{ ratio: 1.8, level: 0.9 }] }),
    gateNoise('body', 'Body', 3, 0.08, [band(700, 0.7)], { attack: 0.002, floor: 0.08, tail: 0.02, noiseSeed: 1.1 }),
  ],
};

// The crash: the whole gate hitting the ground. A short crack, then low
// notes that hang for over a second, with a rattle on top. The Sub layer is
// the weight of it (67, 90 and 116 Hz, close enough to throb against each
// other, as the clip's low end does).
const gateLand: SynthSound = {
  version: 1,
  level: 0.12,
  layers: [
    gateNoise('crack', 'Crack', 2.2, 0.09, [band(700, 0.5), below(2000)], { floor: 0.1, tail: 0.03, noiseSeed: 1.6 }),
    gateNote('sub', 'Sub', 67, 0.63, 2, { hold: 0.12, harmonics: [{ ratio: 1.34, level: 0.9 }, { ratio: 1.73, level: 0.92 }] }),
    gateNote('under', 'Under', 172, 0.8, 2.2, { hold: 0.12, harmonics: [{ ratio: 1.07, level: 0.7 }] }),
    gateNote('boom', 'Boom', 247, 1.1, 2.2, { hold: 0.12 }),
    gateNote('knell', 'Knell', 291, 0.9, 1.4, { hold: 0.12, harmonics: [{ ratio: 1.295, level: 0.7 }] }),
    gateNoise('rattle', 'Rattle', 7, 1.8, [band(560, 1)], {
      attack: 0.01, hold: 0.1, tail: 0.25, noiseSeed: 0.9, tremble: { rate: 25, depth: 8, seed: 0.4 },
    }),
  ],
};

// The smaller knock: the rebounds, the page-load settle, a grabbed gate.
// Brighter and much shorter than the crash (the recording's second,
// smaller hit). NOT the lock at the top any more: that is the crash.
const gateLock: SynthSound = {
  version: 1,
  level: 0.085,
  layers: [
    gateNoise('bite', 'Bite', 6, 0.08, [band(2400, 0.8), below(3800)], { attack: 0.001, floor: 0.1, tail: 0.02, noiseSeed: 1.2 }),
    gateNote('clank', 'Clank', 495, 1, 0.4, {
      attack: 0.004, harmonics: [{ ratio: 0.74, level: 0.5 }, { ratio: 1.39, level: 0.6 }, { ratio: 1.83, level: 0.55 }],
    }),
    gateNote('weight', 'Weight', 86, 0.6, 0.25, { attack: 0.004, harmonics: [{ ratio: 2.76, level: 0.9 }] }),
  ],
};

// ---- sign-creak: a sign rocking on its loose bolt -------------------------------
// (user ask 2026-11-15: "a sound for the signs that can wobble ... something
// creaky ... They are either metal or wood on metal bars")
// MEASURED FIRST, from three public-domain recordings on Wikimedia Commons
// (all by "stephan"; only numbers were taken):
//   "Door handle creaking": the creak proper. ONE rough note, 82% of it
//     between 600 and 1200 Hz: it starts near 1040 Hz and slides down to
//     about 860 over half a second; a faint note three times higher; and
//     its loudness flutters about 85 times a second, very evenly, which is
//     the grit (without it this would be a whistle). It takes 40 ms to
//     arrive, holds for 100, then fades slowly.
//   "Rusty metal door clasp": a HELD whistle at 3.1 kHz, then 1.3 kHz. That
//     is the screech the user asked to keep out of the gate; not used.
//   "Creaky wooden casket": no note at all, a run of tiny cracks (about 67
//     a second, then irregular) between 600 and 2400 Hz. That is the Grain.
// So: a short knock as the sign is poked, a creak as it swings one way
// (sliding down), a lower, softer creak as it swings back, and a grain of
// crackle under both. Pitched a little below the door handle's (880 Hz, not
// 1040): every earlier sound that began high was "silly" to the user's ear.
// As long as the wobble (signWobble.ts, 0.55 s). About as loud as "Scroll
// rolls up". Unheard when written.
const creakNote = (id: string, name: string, from: number, to: number, start: number, length: number, level: number, more: Partial<SynthLayer> = {}): SynthLayer => ({
  id, name, source: 'tone', wave: 'sine', start, length, level, attack: 0.035, hold: 0.07, floor: 0.25, tail: 0.05,
  pitch: { from, to },
  harmonics: [{ ratio: 0.5, level: 0.3 }, { ratio: 2, level: 0.12 }, { ratio: 3.05, level: 0.12 }],
  pulse: { rate: 85, depth: 0.75 },
  ...more,
});
const signCreak: SynthSound = {
  version: 1,
  level: 0.022,
  layers: [
    {
      id: 'tick', name: 'Tick', source: 'noise', start: 0, length: 0.03, level: 2, attack: 0.001, hold: 0, floor: 0.05, tail: 0.01,
      noiseSeed: 0.9, filters: [{ type: 'bandpass', q: 0.9, cutoff: { from: 1500, to: 1500 } }],
    },
    creakNote('creak', 'Creak', 880, 760, 0.01, 0.24, 1),
    creakNote('creak-back', 'Creak back', 700, 630, 0.2, 0.33, 0.5, { attack: 0.05, hold: 0.05, floor: 0.2, tail: 0.1 }),
    {
      id: 'grain', name: 'Grain', source: 'noise', start: 0.01, length: 0.5, level: 1.2, attack: 0.03, hold: 0.1, floor: 0.15, tail: 0.1,
      noiseSeed: 0.4, filters: [{ type: 'bandpass', q: 1, cutoff: { from: 1100, to: 900 } }],
      tremble: { rate: 60, depth: 25, seed: 0.6 },
    },
  ],
};

export const BUILT_IN_SOUNDS: readonly BuiltInSound[] = [
  { id: 'torch-out', name: 'Torch goes out', where: 'A lintel torch is put out, by a tap or a lost run', sound: torchOut },
  { id: 'torch-lit', name: 'Torch lights', where: 'A lintel torch is lit, by a tap or a retry', sound: torchLit },
  { id: 'scroll-roll', name: 'Scroll rolls up', where: 'The quest scroll rolls shut (0.5s)', sound: scrollPaper(0.5, 2700, 1250, 1.2, 0.2) },
  { id: 'scroll-unroll', name: 'Scroll unfurls', where: 'The quest scroll opens (0.65s)', sound: scrollPaper(0.65, 1150, 2900, 0.1, 0.9) },
  { id: 'scroll-land', name: 'Scroll lands', where: 'The rolled scroll presses onto the board, and lands at either end of its toss', sound: scrollLand },
  { id: 'scroll-sparkle', name: 'Quest sparkle', where: 'The quest scroll unfurls', sound: scrollSparkle },
  { id: 'gate-rumble', name: 'Gate moves', where: 'The menu gate is lowering or rising (stretched to fit the move)', sound: gateRumble },
  { id: 'gate-rung', name: 'Gate rung', where: 'One rung of the menu gate passes the bar: a clack (once per rung)', sound: gateRung },
  { id: 'gate-land', name: 'Gate crashes', where: 'The menu gate hits the ground, or slams home at the top', sound: gateLand },
  { id: 'gate-lock', name: 'Gate knocks', where: 'The smaller knock: the two rebounds after the crash, the page-load settle, a grabbed gate', sound: gateLock },
  { id: 'sign-creak', name: 'Sign creaks', where: 'A sign rocks on its bolt: poked, or (quieter) rattled by the gate', sound: signCreak },
];

export function builtInSound(id: BuiltInSoundId): SynthSound {
  return BUILT_IN_SOUNDS.find(s => s.id === id)!.sound;
}
