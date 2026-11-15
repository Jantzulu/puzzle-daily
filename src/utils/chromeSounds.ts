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

export type ChromeSound = 'torch-out';

type Recipe = (ctx: BaseAudioContext, out: AudioNode, at: number, variant: number) => void;

// ---- shared: one second of seeded white noise per context -----------------
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 20261114;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
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
// Two soft layers of air, nothing else:
//   woosh   the flame going: a low breath that swells and falls away
//   sigh    the smoke after it: a fainter, slightly higher breath that
//           trails a little longer
// The user's ear shaped this (2026-11-14):
//   v1 opened with a low thump: "a knock", heavier than a torch going out.
//      So nothing starts abruptly: both layers rise from silence over
//      `swell` seconds.
//   v2 had a thin high hiss and tiny pops: "sand falling onto a hard
//      surface". So there are no pops, and nothing bright: everything goes
//      through `ceiling`, which removes the top of the range where noise
//      turns gritty.
// `variant` 1 (the second torch of a pair) is pitched a little lower and
// uses a different stretch of noise, so a pair never sounds like one sound
// doubled.
const TORCH_OUT = {
  /** Overall loudness of the whole sound. */
  level: 0.45,
  /** A layer fades to this fraction of its peak, then to nothing. */
  floor: 0.05,
  /** Nothing above about this frequency (Hz) gets through. */
  ceiling: 1500,
  woosh: { peak: 1.5, swell: 0.14, length: 0.55, from: 420, crest: 720, to: 330, q: 0.8 },
  sigh: { peak: 0.5, swell: 0.18, length: 0.7, from: 1300, to: 800, q: 0.7 },
} as const;

/** The last stretch of a layer: a straight fade to silence, so it never clicks off. */
const TAIL = 0.06;

const torchOut: Recipe = (ctx, out, at, variant) => {
  const T = TORCH_OUT;
  const pitch = variant ? 0.9 : 1;
  const master = ctx.createGain();
  master.gain.value = T.level;
  master.connect(out);
  // Two filters in a row: a steep cut, so no grit leaks past the ceiling.
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = T.ceiling;
  soften.Q.value = 0.5;
  const soften2 = ctx.createBiquadFilter();
  soften2.type = 'lowpass';
  soften2.frequency.value = T.ceiling;
  soften2.Q.value = 0.5;
  soften.connect(soften2).connect(master);

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
    noise(ctx, at, variant ? 0.37 : 0, T.woosh.length, pitch).connect(filter).connect(gain).connect(soften);
  }

  // Sigh.
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = T.sigh.q;
    filter.frequency.setValueAtTime(T.sigh.from * pitch, at);
    filter.frequency.exponentialRampToValueAtTime(T.sigh.to * pitch, at + T.sigh.length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(T.sigh.peak, at + T.sigh.swell);
    gain.gain.exponentialRampToValueAtTime(T.sigh.peak * T.floor, at + T.sigh.length - TAIL);
    gain.gain.linearRampToValueAtTime(0, at + T.sigh.length);
    noise(ctx, at, variant ? 0.71 : 0.5, T.sigh.length, pitch).connect(filter).connect(gain).connect(soften);
  }
};

const RECIPES: Record<ChromeSound, Recipe> = {
  'torch-out': torchOut,
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
