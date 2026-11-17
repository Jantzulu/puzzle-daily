// "A recording..." in the Sound Forge: turn a sound file into a first sketch
// made of layers (user ask 2026-11-17). utils/synth/fromRecording.ts decides
// WHAT the layers are; this file sets HOW LOUD each is, the way the gate's
// sounds were fitted by hand: render the layer alone, measure it exactly as
// its part of the recording was measured, and scale it to match.
//
// The whole sound is then brought to the game's own loudness (a little
// above "Torch goes out", the Forge's yardstick): a recording can be any
// volume, and what matters from it is how loud its parts are NEXT TO EACH
// OTHER. The file is read, measured and dropped; nothing of it is stored.

import { renderSynthSound } from '../../../utils/synth/render';
import { bandRms, loudest50ms, sketchFromRecording, type RecordingSketch } from '../../../utils/synth/fromRecording';
import type { SynthSound } from '../../../utils/synth/types';
import { REFERENCE } from './forgeModel';

const SAMPLE_RATE = 44100;
/** Larger files are refused before they are read into memory. */
export const MAX_RECORDING_BYTES = 30 * 1024 * 1024;
/** Where the finished sketch sits next to the Forge's reference sound. */
const LOUDNESS_NEXT_TO_REFERENCE = 1.2;

export interface ImportedSound {
  sound: SynthSound;
  sketch: RecordingSketch;
  /** One line for the person: what was made of the recording. */
  summary: string;
}

async function render(sound: SynthSound, seconds: number, solo?: string): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil((seconds + 0.05) * SAMPLE_RATE), SAMPLE_RATE);
  renderSynthSound(ctx, ctx.destination, 0, sound, solo ? { solo } : {});
  return (await ctx.startRendering()).getChannelData(0);
}

const significant = (value: number): number => Number(value.toPrecision(3));

/** Set the levels of a sketch against the recording it came from. */
export async function soundFromSketch(sketch: RecordingSketch): Promise<SynthSound> {
  const draft: SynthSound = { version: 1, level: 1, layers: sketch.layers.map(part => part.layer) };
  // Each layer alone, next to its own part of the recording.
  const wanted: number[] = [];
  for (const part of sketch.layers) {
    const layer = part.layer;
    const alone = await render(draft, sketch.seconds, layer.id);
    const made = bandRms(alone, SAMPLE_RATE, layer.start, layer.start + layer.length, part.band[0], part.band[1]);
    wanted.push(made > 1e-9 ? part.target / made : 0);
  }
  if (!(Math.max(...wanted) > 0)) throw new Error('nothing to make');
  // THE LAYERS SPILL INTO EACH OTHER. A filter's edge is a slope, not a
  // wall, so a strong low layer also puts a little into the bands above it;
  // set alone, the quiet high layers came out half as loud again as the
  // recording's (the gate's crash, first try). So the fit is repeated on
  // the MIX: all layers together, each band compared with the recording
  // over that layer's own stretch, each layer nudged by what its band is
  // off by. Three rounds settle it.
  for (let round = 0; round < 3; round++) {
    const mix = await render({ version: 1, level: 1, layers: sketch.layers.map((part, i) => ({ ...part.layer, level: wanted[i] })) }, sketch.seconds);
    sketch.layers.forEach((part, i) => {
      if (!(wanted[i] > 0)) return;
      const layer = part.layer;
      const got = bandRms(mix, SAMPLE_RATE, layer.start, layer.start + layer.length, part.band[0], part.band[1]);
      if (got > 1e-9) wanted[i] *= Math.max(0.25, Math.min(4, part.target / got));
    });
  }
  const top = Math.max(...wanted);
  // The loudest layer sits at 1 and the rest under it; the sound's own level
  // carries the rest, so every number is inside the Forge's sliders. A
  // layer the others' spill has made needless (under 2% of the loudest) goes.
  const balanced: SynthSound = {
    version: 1,
    level: 1,
    layers: sketch.layers
      .map((part, i) => ({ ...part.layer, level: significant(wanted[i] / top) }))
      .filter(layer => layer.level >= 0.02),
  };
  const whole = await render(balanced, sketch.seconds);
  const loud = loudest50ms(whole, SAMPLE_RATE);
  const level = loud > 0 ? (REFERENCE.loudness * LOUDNESS_NEXT_TO_REFERENCE) / loud : 0.1;
  return { ...balanced, level: significant(Math.max(0.005, Math.min(1.5, level))) };
}

/** Read a sound file and make the sketch. Throws when it cannot be read as sound, or is silent. */
export async function soundFromRecording(file: Blob): Promise<ImportedSound> {
  const bytes = await file.arrayBuffer();
  const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(bytes);
  // Both ears into one.
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
  }
  const sketch = sketchFromRecording(mono, decoded.sampleRate);
  if (!sketch) throw new Error('silent');
  const sound = await soundFromSketch(sketch);

  // Counted from the finished sound: setting the levels can drop a layer.
  const notes = sound.layers.filter(layer => layer.source === 'tone').length;
  const bands = sound.layers.length - notes;
  const parts = [
    notes > 0 ? `${notes} note${notes === 1 ? '' : 's'}` : '',
    bands > 0 ? `${bands} band${bands === 1 ? '' : 's'} of noise` : '',
  ].filter(Boolean).join(' and ');
  let summary = `${sound.layers.length} layers from ${sketch.seconds.toFixed(1)} s of sound: ${parts}`;
  if (sketch.hits > 1) summary += `, in ${sketch.hits} separate hits`;
  summary += '.';
  if (sketch.runTogether) summary += ' Many quick hits were treated as one continuous sound.';
  if (sketch.heardSeconds > sketch.seconds + 0.05) summary += ` Only the first ${Math.round(sketch.seconds)} s were used.`;
  return { sound, sketch, summary };
}
