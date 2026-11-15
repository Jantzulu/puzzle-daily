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
// Three layers:
//   puff     the flame collapsing: a short low breath of air
//   hiss     the ember sizzling out: a thin high hiss that fades
//   crackle  two or three tiny pops in the tail
// `variant` 1 (the second torch of a pair) is pitched a little lower and
// pops at different moments, so a pair never sounds like one sound doubled.
const TORCH_OUT = {
  /** Overall loudness of the whole sound. */
  level: 0.55,
  /** A layer fades to this fraction of its peak, then to nothing. */
  floor: 0.05,
  puff: { peak: 1.8, attack: 0.012, length: 0.22, from: 950, to: 240 },
  hiss: { peak: 0.75, attack: 0.03, hold: 0.07, length: 0.65, from: 5400, to: 2600 },
  crackle: { peak: 0.35, length: 0.006, times: [[0.16, 0.29, 0.41], [0.19, 0.33]] },
} as const;

/** The last stretch of a layer: a straight fade to silence, so it never clicks off. */
const TAIL = 0.05;

const torchOut: Recipe = (ctx, out, at, variant) => {
  const T = TORCH_OUT;
  const pitch = variant ? 0.9 : 1;
  const master = ctx.createGain();
  master.gain.value = T.level;
  master.connect(out);

  // Puff.
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(T.puff.from * pitch, at);
    filter.frequency.exponentialRampToValueAtTime(T.puff.to * pitch, at + T.puff.length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(T.puff.peak, at + T.puff.attack);
    gain.gain.exponentialRampToValueAtTime(T.puff.peak * T.floor, at + T.puff.length - TAIL);
    gain.gain.linearRampToValueAtTime(0, at + T.puff.length);
    noise(ctx, at, variant ? 0.37 : 0, T.puff.length, pitch).connect(filter).connect(gain).connect(master);
  }

  // Hiss.
  {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(T.hiss.from * pitch, at);
    filter.frequency.exponentialRampToValueAtTime(T.hiss.to * pitch, at + T.hiss.length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(T.hiss.peak, at + T.hiss.attack);
    gain.gain.setValueAtTime(T.hiss.peak, at + T.hiss.attack + T.hiss.hold);
    gain.gain.exponentialRampToValueAtTime(T.hiss.peak * T.floor, at + T.hiss.length - TAIL);
    gain.gain.linearRampToValueAtTime(0, at + T.hiss.length);
    noise(ctx, at, variant ? 0.71 : 0.5, T.hiss.length).connect(filter).connect(gain).connect(master);
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
