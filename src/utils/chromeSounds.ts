// Chrome sounds: short effects for the page furniture (torches, and later
// the gate, the scroll, the signs), made by code instead of played from
// files (user pick 2026-11-13). Nothing to download; they play through the
// effects channel, so the volume sliders and the sound switch apply.
//
// PLACEHOLDERS, like the placeholder art: each recipe below is the drop-in
// point. To use a recording instead, play it from playChromeSound in place
// of the recipe.
//
// Each recipe is a pure function of (context, destination, start time,
// variant), so it can also be rendered silently in an OfflineAudioContext to
// measure it. No Math.random: the noise is seeded, so a sound is the same
// every time and a tuning change is the only thing that changes it.

import { soundManager } from './soundManager';

export type ChromeSound = 'torch-out' | 'torch-lit' | 'scroll-roll' | 'scroll-unroll' | 'scroll-land' | 'scroll-sparkle';

type Recipe = (ctx: BaseAudioContext, out: AudioNode, at: number, variant: number) => void;

// ---- shared: two seconds of seeded white noise per context ----------------
// The generator is mulberry32, a proper 32-bit one. The first three versions
// of the torch sound used a multiply-and-mask generator whose multiply
// overflowed what a JS number holds exactly: its noise REPEATED every
// 10,466 samples, about four times a second, which is audible as a
// mechanical flutter (the user's "robotic"). Any new generator here must be
// checked for repeats.
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 20261114;
    for (let i = 0; i < data.length; i++) {
      state = (state + 0x6d2b79f5) | 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      data[i] = (((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** A stretch of the noise, starting `offset` seconds into the buffer. */
function noise(ctx: BaseAudioContext, at: number, offset: number, seconds: number, rate = 1): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  source.playbackRate.value = rate;
  source.start(at, offset);
  source.stop(at + seconds);
  return source;
}

// ---- torch-out: a torch snuffed -------------------------------------------
// Three layers:
//   woosh    the flame going: a breath of air that SWELLS and falls away
//   hiss     the ember sizzling out: a thin high hiss that fades
//   crackle  two or three tiny pops in the tail, barely there
// The user's ear shaped this (2026-11-14/15):
//   v1 opened with a low thump: "a knock", heavier than a torch going out.
//      So nothing starts abruptly: both noise layers rise from silence over
//      `swell` seconds, and the woosh sits in the middle of the range.
//   v2 (this recipe, louder): "sand falling onto a hard surface", too
//      intense. So the hiss and the pops are much quieter now.
//   v3 dropped the hiss for two low narrow sweeps: "weird, almost robotic",
//      worse than v2. Narrow bands of noise that slide in pitch are how a
//      synthetic voice is made. Keep the noise BROAD; do not go back there.
//   v4 (v2 again, 40% quieter, on fixed noise): the right kind of sound,
//      "but as if made 300% more intense", and the opening "like somebody
//      sweeping debris on the floor". So the whole sound is about half as
//      loud again, and the woosh is shorter, quieter, and only FALLS in
//      pitch: the rise-then-fall it had is the gesture of a broom stroke.
// `variant` 1 (the second torch of a pair) is pitched a little lower and
// pops at different moments, so a pair never sounds like one sound doubled.
const TORCH_OUT = {
  /** Overall loudness of the whole sound. */
  level: 0.22,
  /** A layer fades to this fraction of its peak, then to nothing. */
  floor: 0.05,
  woosh: { peak: 0.6, swell: 0.1, length: 0.3, from: 950, crest: 1000, to: 450, q: 1 },
  hiss: { peak: 0.36, swell: 0.12, hold: 0.06, length: 0.55, from: 5400, to: 2600 },
  crackle: { peak: 0.1, length: 0.006, times: [[0.24, 0.33, 0.45], [0.27, 0.38]] },
} as const;

/** The last stretch of a layer: a straight fade to silence, so it never clicks off. */
const TAIL = 0.05;

const torchOut: Recipe = (ctx, out, at, variant) => {
  const T = TORCH_OUT;
  const pitch = variant ? 0.9 : 1;
  const master = ctx.createGain();
  master.gain.value = T.level;
  master.connect(out);

  // Woosh.
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = T.woosh.q;
    filter.frequency.setValueAtTime(T.woosh.from * pitch, at);
    filter.frequency.exponentialRampToValueAtTime(T.woosh.crest * pitch, at + T.woosh.swell);
    filter.frequency.exponentialRampToValueAtTime(T.woosh.to * pitch, at + T.woosh.length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(T.woosh.peak, at + T.woosh.swell);
    gain.gain.exponentialRampToValueAtTime(T.woosh.peak * T.floor, at + T.woosh.length - TAIL);
    gain.gain.linearRampToValueAtTime(0, at + T.woosh.length);
    noise(ctx, at, variant ? 0.37 : 0, T.woosh.length, pitch).connect(filter).connect(gain).connect(master);
  }

  // Hiss.
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(T.hiss.from * pitch, at);
    filter.frequency.exponentialRampToValueAtTime(T.hiss.to * pitch, at + T.hiss.length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(T.hiss.peak, at + T.hiss.swell);
    gain.gain.setValueAtTime(T.hiss.peak, at + T.hiss.swell + T.hiss.hold);
    gain.gain.exponentialRampToValueAtTime(T.hiss.peak * T.floor, at + T.hiss.length - TAIL);
    gain.gain.linearRampToValueAtTime(0, at + T.hiss.length);
    noise(ctx, at, variant ? 1.5 : 1.1, T.hiss.length).connect(filter).connect(gain).connect(master);
  }

  // Crackle.
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800 * pitch;
    const gain = ctx.createGain();
    gain.gain.value = T.crackle.peak;
    filter.connect(gain).connect(master);
    T.crackle.times[variant ? 1 : 0].forEach((time, i) => {
      noise(ctx, at + time, 0.11 * (i + 1), T.crackle.length).connect(filter);
    });
  }
};

// ---- torch-lit: a torch catching ------------------------------------------
// The mirror of torch-out, at the same quiet level (the level the user
// approved 2026-11-15, "sounds great! Even on mobile!"): a soft breath that
// swells while its pitch RISES (the flame taking), under a faint high hiss.
// No pops. The same rules apply: no abrupt start, broad noise, subtle.
const TORCH_LIT = {
  level: 0.28,
  floor: 0.05,
  woosh: { peak: 0.6, swell: 0.12, length: 0.34, from: 480, to: 1000, q: 1 },
  hiss: { peak: 0.18, swell: 0.14, length: 0.42, from: 3000, to: 4400 },
} as const;

const torchLit: Recipe = (ctx, out, at, variant) => {
  const T = TORCH_LIT;
  const pitch = variant ? 0.9 : 1;
  const master = ctx.createGain();
  master.gain.value = T.level;
  master.connect(out);

  // Woosh.
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = T.woosh.q;
    filter.frequency.setValueAtTime(T.woosh.from * pitch, at);
    filter.frequency.exponentialRampToValueAtTime(T.woosh.to * pitch, at + T.woosh.length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(T.woosh.peak, at + T.woosh.swell);
    gain.gain.exponentialRampToValueAtTime(T.woosh.peak * T.floor, at + T.woosh.length - TAIL);
    gain.gain.linearRampToValueAtTime(0, at + T.woosh.length);
    noise(ctx, at, variant ? 0.83 : 0.6, T.woosh.length, pitch).connect(filter).connect(gain).connect(master);
  }

  // Hiss.
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(T.hiss.from * pitch, at);
    filter.frequency.exponentialRampToValueAtTime(T.hiss.to * pitch, at + T.hiss.length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(T.hiss.peak, at + T.hiss.swell);
    gain.gain.exponentialRampToValueAtTime(T.hiss.peak * T.floor, at + T.hiss.length - TAIL);
    gain.gain.linearRampToValueAtTime(0, at + T.hiss.length);
    noise(ctx, at, variant ? 1.45 : 1.3, T.hiss.length).connect(filter).connect(gain).connect(master);
  }
};

// ---- scroll-roll / scroll-unroll: the quest scroll's parchment ------------
// A SWOOSH with a little paper in it: one broad band of noise that swells
// and falls with the roll's speed while its tone slides (up as the scroll
// opens, down as it rolls shut), with a fast, shallow tremble so it is a
// sheet moving and not just air.
// The user's ear (2026-11-15) on v1, which had a small tone slide and a
// slow, deep, irregular wobble in its loudness: not what an unfurling
// scroll sounds like, "very creaky, and could maybe do with more of a
// swoosh". The slow deep wobble was the creak: so the wobble is now fast
// and shallow, and the slide is wide enough to hear as a swoosh.
// (A run of dry paper ticks was tried between the two and never shipped:
// more crackle is the opposite of what was asked.)
// The lengths match index.css (.quest-closing 0.5s, the unfurl 0.65s).
const SCROLL = {
  level: 0.2,
  peak: 0.5,
  /** Where in the sound it is loudest (0-1): the roll is fastest here. */
  crest: 0.4,
  /** How narrow the band is: higher makes the slide more of a whistle. */
  q: 0.9,
  /** The paper: how fast the loudness trembles (Hz) and how deeply. */
  tremble: { rate: 90, depth: 5 },
  roll: { length: 0.5, from: 2700, to: 1250 },
  unroll: { length: 0.65, from: 1150, to: 2900 },
} as const;

const scrollPaper = (which: 'roll' | 'unroll'): Recipe => (ctx, out, at) => {
  const T = SCROLL;
  const P = T[which];
  const master = ctx.createGain();
  master.gain.value = T.level;
  master.connect(out);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = T.q;
  filter.frequency.setValueAtTime(P.from, at);
  filter.frequency.exponentialRampToValueAtTime(P.to, at + P.length);

  // The tremble: volume = 1 + (slowed noise * depth).
  const tremble = ctx.createGain();
  tremble.gain.value = 1;
  const slow = ctx.createBiquadFilter();
  slow.type = 'lowpass';
  slow.frequency.value = T.tremble.rate;
  const depth = ctx.createGain();
  depth.gain.value = T.tremble.depth;
  noise(ctx, at, which === 'roll' ? 0.2 : 0.9, P.length).connect(slow).connect(depth).connect(tremble.gain);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(T.peak, at + P.length * T.crest);
  gain.gain.exponentialRampToValueAtTime(T.peak * 0.05, at + P.length - TAIL);
  gain.gain.linearRampToValueAtTime(0, at + P.length);

  noise(ctx, at, which === 'roll' ? 1.2 : 0.1, P.length).connect(filter).connect(tremble).connect(gain).connect(master);
};

// ---- scroll-land: the rolled scroll pressed onto the board ----------------
// The scroll arrives rolled up and stamps into place before it unfurls
// (index.css quest-plate-stamp); the user asked for an impact there
// (2026-11-15). Two layers, both over in a fraction of a second:
//   thump  a very low, very short note: the weight, felt more than heard
//   smack  a short burst of BROAD noise: wood and parchment meeting stone
// This one IS a real impact, so it starts at once (the torch's "knock" was
// wrong because a torch going out is not one).
// The user's ear on v1: "a little less hollow box sounding". v1's note fell
// from 150 Hz and rang for 0.16s, over a narrow band of noise at 900 Hz:
// a ringing low note plus a boxy middle is exactly a knock on a crate. Now
// the note is lower and half as long (a thump, not a tone), and the noise
// is broad with its low middle cut away.
// Phone speakers cannot play the thump; the smack is what carries there.
const SCROLL_LAND = {
  level: 0.16,
  thump: { peak: 0.45, attack: 0.003, length: 0.085, from: 92, to: 46 },
  smack: { peak: 1.6, attack: 0.001, length: 0.05, above: 420, below: 3400 },
} as const;

const scrollLand: Recipe = (ctx, out, at) => {
  const T = SCROLL_LAND;
  const master = ctx.createGain();
  master.gain.value = T.level;
  master.connect(out);

  // Thump.
  {
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(T.thump.from, at);
    tone.frequency.exponentialRampToValueAtTime(T.thump.to, at + T.thump.length * 0.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(T.thump.peak, at + T.thump.attack);
    gain.gain.exponentialRampToValueAtTime(T.thump.peak * 0.02, at + T.thump.length - 0.015);
    gain.gain.linearRampToValueAtTime(0, at + T.thump.length);
    tone.connect(gain).connect(master);
    tone.start(at);
    tone.stop(at + T.thump.length);
  }

  // Smack.
  {
    const lows = ctx.createBiquadFilter();
    lows.type = 'highpass';
    lows.frequency.value = T.smack.above;
    const highs = ctx.createBiquadFilter();
    highs.type = 'lowpass';
    highs.frequency.value = T.smack.below;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(T.smack.peak, at + T.smack.attack);
    gain.gain.exponentialRampToValueAtTime(T.smack.peak * 0.02, at + T.smack.length - 0.01);
    gain.gain.linearRampToValueAtTime(0, at + T.smack.length);
    noise(ctx, at, 1.6, T.smack.length).connect(lows).connect(highs).connect(gain).connect(master);
  }
};

// ---- scroll-sparkle: the quest is important -------------------------------
// When a quest FIRST unfurls on a puzzle, a little run of bright glints
// rises over the scroll's swoosh (user ask 2026-11-15: "a sparkling or
// magical effect ... this thing (the quest) is important!"). Not on a
// reopen: the player has seen that quest already.
// Each glint is a clear high note that starts softly and rings away, with a
// fainter, slightly sour partner note above it (what makes a note sound
// like a small bell and not a beep). The notes climb a major chord.
const SCROLL_SPARKLE = {
  level: 0.035,
  /** The glints, low to high (Hz): G6 B6 D7 G7 B7. */
  notes: [1568, 1976, 2349, 3136, 3951],
  /** Seconds between one glint and the next. */
  every: 0.06,
  attack: 0.006,
  /** How long each one rings (s). */
  ring: 0.42,
  /** The partner note: how far above, and how loud next to the main one. */
  partner: { ratio: 2.76, level: 0.22 },
} as const;

const scrollSparkle: Recipe = (ctx, out, at) => {
  const T = SCROLL_SPARKLE;
  const master = ctx.createGain();
  master.gain.value = T.level;
  master.connect(out);
  T.notes.forEach((hz, i) => {
    const when = at + i * T.every;
    // Later, higher glints are a little quieter: the run fades as it climbs.
    const loud = 1 - i * 0.12;
    for (const [pitch, level] of [[hz, loud], [hz * T.partner.ratio, loud * T.partner.level]] as const) {
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = pitch;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(level, when + T.attack);
      gain.gain.exponentialRampToValueAtTime(level * 0.01, when + T.ring - 0.03);
      gain.gain.linearRampToValueAtTime(0, when + T.ring);
      tone.connect(gain).connect(master);
      tone.start(when);
      tone.stop(when + T.ring);
    }
  });
};

const RECIPES: Record<ChromeSound, Recipe> = {
  'torch-out': torchOut,
  'torch-lit': torchLit,
  'scroll-roll': scrollPaper('roll'),
  'scroll-unroll': scrollPaper('unroll'),
  'scroll-land': scrollLand,
  'scroll-sparkle': scrollSparkle,
};

/** Draw a chrome sound into any audio context (used for measuring it). */
export function renderChromeSound(sound: ChromeSound, ctx: BaseAudioContext, out: AudioNode, at: number, variant = 0): void {
  RECIPES[sound](ctx, out, at, variant);
}

/**
 * Play a chrome sound now, or `delay` seconds from now (to land on a beat
 * partway through an animation). Silent when sound is off, or when audio has
 * not been woken by a tap yet.
 */
export function playChromeSound(sound: ChromeSound, variant = 0, delay = 0): void {
  soundManager.playSynth((ctx, out, at) => RECIPES[sound](ctx, out, at + delay, variant));
}
