// THE SOUND FORMAT. A sound made by code is a stack of LAYERS; each layer is
// a little noise or a tone, shaped by a handful of numbers. Nothing here is
// audio data: a whole sound is a few hundred bytes, however long it rings.
//
// One format for everything (user direction 2026-11-15: develop the game's
// own sound, in the spirit of OSRS, never at the cost of storage for art):
//   - the page furniture's sounds (utils/chromeSounds.ts, shipped in the repo)
//   - any sound asset (SoundAsset.synth), so every sound slot in the game
//     can take one
//   - the Sound Forge editor (components/editor/soundForge), which edits it
//
// render.ts turns a SynthSound into audio. Keep this file free of code that
// touches the browser: it is imported by types/game.ts.

/** The shape of a tone's wave: smooth, soft, hollow, buzzy. */
export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

/** What a filter stage keeps: the lows, the highs, or a band in the middle. */
export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

/**
 * A value that changes over a layer's length (a pitch, a filter's position).
 * It starts at `from` and glides to `to`. `via` is an optional turning point
 * on the way; `arriveAt` makes it reach `to` early and stay there.
 * Times are seconds from the layer's start.
 */
export interface Slide {
  from: number;
  to: number;
  via?: { value: number; at: number };
  arriveAt?: number;
}

export interface FilterStage {
  type: FilterType;
  /** Where the filter sits (Hz). */
  cutoff: Slide;
  /**
   * bandpass: how narrow the band is (higher = narrower, more of a whistle).
   * lowpass / highpass: a bump at the edge, in dB (leave unset for none).
   */
  q?: number;
}

export interface SynthLayer {
  id: string;
  name: string;
  /** What the layer is made of. */
  source: 'noise' | 'tone';
  muted?: boolean;

  /** When it begins (s from the sound's start) and how long it lasts (s). */
  start: number;
  length: number;

  // ---- its loudness over time ---------------------------------------------
  /** Loudness at its peak. */
  level: number;
  /** Seconds to rise from silence to the peak. 0 = it starts at full. */
  attack: number;
  /** Seconds it stays at the peak. */
  hold: number;
  /** How far it fades before the end: this fraction of the peak (0-1). */
  floor: number;
  /** The last stretch (s): a straight fade to silence, so it never clicks. */
  tail: number;

  // ---- a tone ---------------------------------------------------------------
  wave?: Wave;
  /** Its pitch (Hz). */
  pitch?: Slide;
  /** A second, higher note sounded with it: how many times higher, how loud. */
  overtone?: { ratio: number; level: number };
  /** A wobble in pitch: how fast (Hz) and how far (cents; 100 = one semitone). */
  vibrato?: { rate: number; depth: number };

  // ---- noise ----------------------------------------------------------------
  /** Which stretch of the noise it uses (s into a 2s buffer). */
  noiseSeed?: number;
  /** Playback speed of the noise (1 = normal). */
  noiseRate?: number;

  // ---- colour and movement ---------------------------------------------------
  /** Up to two filter stages, applied in order. */
  filters?: FilterStage[];
  /** An irregular tremble in loudness: how fast (Hz), how deep, which noise. */
  tremble?: { rate: number; depth: number; seed: number };
}

export interface SynthSound {
  version: 1;
  /** Overall loudness of the whole sound. */
  level: number;
  layers: SynthLayer[];
}

/** How long the whole sound lasts (s): the end of its last layer. */
export function soundLength(sound: SynthSound): number {
  return sound.layers.reduce((end, l) => Math.max(end, l.start + l.length), 0);
}
