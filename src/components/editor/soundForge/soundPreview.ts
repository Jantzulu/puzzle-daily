// Hearing and seeing a sound in the Forge.
//   auditionSound  plays it now, through the game's effects channel (so it
//                  is as loud as it will be in the game), cutting off
//                  whatever the Forge was still playing
//   pictureSound   renders it silently and measures it: a waveform to
//                  draw, its peak, and how loud its loudest moment is

import { soundManager } from '../../../utils/soundManager';
import { renderSynthSound, type RenderOptions } from '../../../utils/synth/render';
import { soundLength, type SynthSound } from '../../../utils/synth/types';

let lastVoice: { ctx: BaseAudioContext; gain: GainNode } | null = null;

export function auditionSound(sound: SynthSound, options: RenderOptions = {}): void {
  soundManager.playSynth((ctx, out, at) => {
    // Fade out the previous audition quickly, so dragging a slider does not
    // pile copies on top of each other.
    const fade = 0.03;
    if (lastVoice && lastVoice.ctx === ctx) {
      const g = lastVoice.gain.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(g.value, at);
      g.linearRampToValueAtTime(0, at + fade);
    }
    const voice = ctx.createGain();
    voice.connect(out);
    lastVoice = { ctx, gain: voice };
    renderSynthSound(ctx, voice, at + fade, sound, options);
  });
}

export interface SoundPicture {
  /** How long the sound is (s). */
  length: number;
  /** For each column across the picture: the lowest and highest sample. */
  low: Float32Array;
  high: Float32Array;
  /** The single loudest sample (1 = the most a speaker can do). */
  peak: number;
  /** The loudest 50ms stretch (RMS): closer to how loud it feels. */
  loudness: number;
}

const SAMPLE_RATE = 44100;

export async function pictureSound(sound: SynthSound, columns: number, options: RenderOptions = {}): Promise<SoundPicture> {
  const length = soundLength(sound);
  const frames = Math.max(1, Math.ceil((length + 0.02) * SAMPLE_RATE));
  const low = new Float32Array(columns);
  const high = new Float32Array(columns);
  if (!(length > 0)) return { length: 0, low, high, peak: 0, loudness: 0 };

  const ctx = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  renderSynthSound(ctx, ctx.destination, 0, sound, options);
  const data = (await ctx.startRendering()).getChannelData(0);

  // The picture covers exactly the sound's length, so it lines up with the
  // layer bars drawn under it.
  let peak = 0;
  const drawn = Math.min(data.length, Math.round(length * SAMPLE_RATE));
  const perColumn = drawn / columns;
  for (let c = 0; c < columns; c++) {
    let lo = 0;
    let hi = 0;
    const end = Math.min(drawn, Math.max(Math.floor(c * perColumn) + 1, Math.floor((c + 1) * perColumn)));
    for (let i = Math.floor(c * perColumn); i < end; i++) {
      const v = data[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    low[c] = lo;
    high[c] = hi;
    peak = Math.max(peak, hi, -lo);
  }

  // Loudest 50ms: slide a window along in 10ms steps.
  const span = Math.round(SAMPLE_RATE * 0.05);
  const step = Math.round(SAMPLE_RATE * 0.01);
  let loudness = 0;
  for (let start = 0; start < data.length; start += step) {
    const end = Math.min(data.length, start + span);
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    loudness = Math.max(loudness, Math.sqrt(sum / span));
  }
  return { length, low, high, peak, loudness };
}
