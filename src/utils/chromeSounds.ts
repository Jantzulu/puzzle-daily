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

export type ChromeSound = 'torch-out' | 'torch-lit';

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

const RECIPES: Record<ChromeSound, Recipe> = {
  'torch-out': torchOut,
  'torch-lit': torchLit,
};

/** Draw a chrome sound into any audio context (used for measuring it). */
export function renderChromeSound(sound: ChromeSound, ctx: BaseAudioContext, out: AudioNode, at: number, variant = 0): void {
  RECIPES[sound](ctx, out, at, variant);
}

/**
 * Play a chrome sound now. Silent when sound is off, or when audio has not
 * been woken by a tap yet.
 */
export function playChromeSound(sound: ChromeSound, variant = 0): void {
  soundManager.playSynth((ctx, out, at) => RECIPES[sound](ctx, out, at, variant));
}
