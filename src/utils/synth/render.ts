// Turns a SynthSound (types.ts) into audio nodes. A pure function of
// (context, destination, start time, sound, options), so the same call
// plays a sound live or renders it silently in an OfflineAudioContext to
// measure or draw it. No Math.random: the noise is seeded, so a sound is
// the same every time and only a change to its numbers changes it.

import { MAX_ECHOES, MAX_HARMONICS, runPlan, type Slide, type SynthLayer, type SynthSound } from './types';

export interface RenderOptions {
  /** Multiplies every pitch and filter position (0.9 = a little lower). */
  pitch?: number;
  /** Uses a different stretch of noise, so two copies do not sound doubled. */
  shuffle?: number;
  /** Render only this layer (the editor's Solo). */
  solo?: string;
}

// ---- two seconds of seeded white noise per context ---------------------------
// The generator is mulberry32, a proper 32-bit one. The first versions of the
// torch sound used a multiply-and-mask generator whose multiply overflowed
// what a JS number holds exactly: its noise REPEATED every 10,466 samples,
// about four times a second, audible as a mechanical flutter (the user's
// "robotic"). Any new generator here must be checked for repeats.
const NOISE_SECONDS = 2;
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
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
  source.start(at, ((offset % NOISE_SECONDS) + NOISE_SECONDS) % NOISE_SECONDS);
  source.stop(at + seconds);
  return source;
}

/** Schedule a Slide on an audio parameter, every value times `scale`. */
function applySlide(param: AudioParam, slide: Slide, scale: number, t0: number, length: number): void {
  if (!slide.via && slide.from === slide.to) {
    param.value = slide.from * scale;
    return;
  }
  // Exponential glides (the way pitch is heard) cannot touch zero.
  const hz = (v: number) => Math.max(1, v * scale);
  param.setValueAtTime(hz(slide.from), t0);
  if (slide.via) param.exponentialRampToValueAtTime(hz(slide.via.value), t0 + Math.min(slide.via.at, length));
  param.exponentialRampToValueAtTime(hz(slide.to), t0 + Math.min(slide.arriveAt ?? length, length));
}

function renderLayer(ctx: BaseAudioContext, out: AudioNode, at: number, layer: SynthLayer, options: RenderOptions): void {
  if (!(layer.length > 0) || !(layer.level > 0)) return;
  const scale = options.pitch ?? 1;
  const shuffle = options.shuffle ?? 0;
  const t0 = at + layer.start;
  const end = t0 + layer.length;

  // What it is made of.
  let node: AudioNode;
  if (layer.source === 'noise') {
    node = noise(ctx, t0, (layer.noiseSeed ?? 0) + shuffle, layer.length, (layer.noiseRate ?? 1) * scale);
  } else {
    const pitch = layer.pitch ?? { from: 440, to: 440 };
    const tones: OscillatorNode[] = [];
    const tone = ctx.createOscillator();
    tone.type = layer.wave ?? 'sine';
    applySlide(tone.frequency, pitch, scale, t0, layer.length);
    tones.push(tone);
    node = tone;
    // The notes stacked on the main one, each at its own level.
    const partners = [...(layer.overtone ? [layer.overtone] : []), ...(layer.harmonics ?? [])]
      .filter(p => p.level > 0 && p.ratio > 0)
      .slice(0, MAX_HARMONICS);
    if (partners.length > 0) {
      const mix = ctx.createGain();
      tone.connect(mix);
      for (const p of partners) {
        const partner = ctx.createOscillator();
        partner.type = layer.wave ?? 'sine';
        applySlide(partner.frequency, pitch, scale * p.ratio, t0, layer.length);
        const partnerLevel = ctx.createGain();
        partnerLevel.gain.value = p.level;
        partner.connect(partnerLevel).connect(mix);
        tones.push(partner);
      }
      node = mix;
    }
    if (layer.vibrato && layer.vibrato.depth > 0 && layer.vibrato.rate > 0) {
      const wobble = ctx.createOscillator();
      wobble.frequency.value = layer.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.value = layer.vibrato.depth;
      wobble.connect(depth);
      for (const t of tones) depth.connect(t.detune);
      wobble.start(t0);
      wobble.stop(end);
    }
    // A run: the pitch steps through its list. The steps are set on each
    // oscillator's detune, which ADDS to its pitch, so a run can ride a
    // bend and a wobble both.
    const plan = runPlan(layer);
    for (const step of plan) for (const t of tones) t.detune.setValueAtTime(step.cents, t0 + step.at);
    // ...and, plucked, each step starts full and fades before the next.
    const pluck = Math.min(1, Math.max(0, layer.run?.pluck ?? 0));
    if (plan.length > 0 && pluck > 0) {
      const each = 1 / layer.run!.rate;
      const low = Math.max(1e-4, 1 - pluck);
      const struck = ctx.createGain();
      struck.gain.value = 1;
      for (const step of plan) {
        const at = t0 + step.at;
        // (Two thousandths of a second to rise: a straight jump would click.)
        const rise = Math.min(0.002, each / 4);
        if (step.at > 0) struck.gain.setValueAtTime(low, at);
        else struck.gain.setValueAtTime(1, at);
        if (step.at > 0) struck.gain.linearRampToValueAtTime(1, at + rise);
        struck.gain.exponentialRampToValueAtTime(low, Math.min(end, at + each));
      }
      node.connect(struck);
      node = struck;
    }
    for (const t of tones) {
      t.start(t0);
      t.stop(end);
    }
  }

  // Its colour.
  for (const stage of layer.filters ?? []) {
    const filter = ctx.createBiquadFilter();
    filter.type = stage.type;
    if (stage.q !== undefined) filter.Q.value = stage.q;
    applySlide(filter.frequency, stage.cutoff, scale, t0, layer.length);
    node.connect(filter);
    node = filter;
  }

  // A tremble: volume = 1 + (slowed noise * depth).
  if (layer.tremble && layer.tremble.depth > 0) {
    const tremble = ctx.createGain();
    tremble.gain.value = 1;
    const slow = ctx.createBiquadFilter();
    slow.type = 'lowpass';
    slow.frequency.value = layer.tremble.rate;
    const depth = ctx.createGain();
    depth.gain.value = layer.tremble.depth;
    noise(ctx, t0, layer.tremble.seed + shuffle, layer.length).connect(slow).connect(depth).connect(tremble.gain);
    node.connect(tremble);
    node = tremble;
  }

  // A pulse: volume = 1 + (a steady wave * depth).
  if (layer.pulse && layer.pulse.depth > 0 && layer.pulse.rate > 0) {
    const pulse = ctx.createGain();
    pulse.gain.value = 1;
    const wave = ctx.createOscillator();
    wave.frequency.value = layer.pulse.rate;
    const depth = ctx.createGain();
    depth.gain.value = Math.min(1, layer.pulse.depth);
    wave.connect(depth).connect(pulse.gain);
    wave.start(t0);
    wave.stop(end);
    node.connect(pulse);
    node = pulse;
  }

  // Its loudness over time: rise, hold, fade, and a straight tail to silence.
  const gain = ctx.createGain();
  const peak = layer.level;
  const attack = Math.max(0, Math.min(layer.attack, layer.length));
  const tail = Math.max(0, Math.min(layer.tail, layer.length));
  // The gain holds its opening value from the very start, not only from t0:
  // a source can begin one sample ahead of a timed change, and that one
  // sample would otherwise slip through at full volume (found when the
  // torch's pops came out ten times too loud).
  gain.gain.value = attack > 0 ? 0 : peak;
  gain.gain.setValueAtTime(attack > 0 ? 0 : peak, t0);
  if (attack > 0) gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  const fadeFrom = t0 + attack + Math.max(0, layer.hold);
  if (fadeFrom < end - tail) {
    if (layer.hold > 0) gain.gain.setValueAtTime(peak, fadeFrom);
    gain.gain.exponentialRampToValueAtTime(Math.max(1e-5, peak * layer.floor), end - tail);
  }
  if (tail > 0) gain.gain.linearRampToValueAtTime(0, end);
  node.connect(gain).connect(out);
}

/** Draw a sound into an audio context, starting at time `at`. */
export function renderSynthSound(ctx: BaseAudioContext, out: AudioNode, at: number, sound: SynthSound, options: RenderOptions = {}): void {
  const master = ctx.createGain();
  master.gain.value = sound.level;
  master.connect(out);
  // Echoes: the whole sound again, later and quieter, a fixed number of
  // times. Separate delays, not a loop feeding itself: a loop would keep its
  // nodes alive after the sound has died away.
  const echo = sound.echo;
  if (echo && echo.time > 0 && echo.fade > 0) {
    const repeats = Math.min(MAX_ECHOES, Math.round(echo.repeats));
    for (let i = 1; i <= repeats; i++) {
      const delay = ctx.createDelay(echo.time * i + 0.01);
      delay.delayTime.value = echo.time * i;
      const level = ctx.createGain();
      level.gain.value = Math.pow(Math.min(1, echo.fade), i);
      master.connect(delay).connect(level).connect(out);
    }
  }
  for (const layer of sound.layers) {
    if (options.solo ? layer.id !== options.solo : layer.muted) continue;
    renderLayer(ctx, master, at, layer, options);
  }
}
