import { describe, expect, it } from 'vitest';
import { bandRms, sketchFromRecording } from '../synth/fromRecording';

// The sketch of a recording (utils/synth/fromRecording.ts) is made by plain
// arithmetic on the samples, so it can be pinned with sounds made here by
// formula: what is in them is known exactly.

const SR = 44100;

/** Seeded noise in -1..1 (the same generator as the synth's). */
function noise(count: number, seed = 20261117): Float32Array {
  const out = new Float32Array(count);
  let state = seed;
  for (let i = 0; i < count; i++) {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    out[i] = (((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return out;
}

/** A note that starts at once and dies away, after `lead` seconds of silence. */
function ringingNote(hz: number, seconds: number, lead = 0.1, level = 0.5): Float32Array {
  const out = new Float32Array(Math.round((lead + seconds + 0.1) * SR));
  const start = Math.round(lead * SR);
  for (let i = 0; i < seconds * SR; i++) {
    const t = i / SR;
    out[start + i] = level * Math.sin(2 * Math.PI * hz * t) * Math.exp((-4 * t) / seconds);
  }
  return out;
}

describe('a sketch of a recording', () => {
  it('finds nothing in silence', () => {
    expect(sketchFromRecording(new Float32Array(SR), SR)).toBeNull();
    expect(sketchFromRecording(new Float32Array(0), SR)).toBeNull();
  });

  it('hears a ringing note as one tone layer at its pitch, with the silence before it trimmed', () => {
    const sketch = sketchFromRecording(ringingNote(440, 0.6), SR)!;
    expect(sketch).not.toBeNull();
    const notes = sketch.layers.filter(l => l.kind === 'note');
    expect(notes).toHaveLength(1);
    const note = notes[0].layer;
    expect(note.source).toBe('tone');
    expect(note.pitch!.from).toBeGreaterThan(440 * 0.98);
    expect(note.pitch!.from).toBeLessThan(440 * 1.02);
    expect(note.pitch!.to).toBe(note.pitch!.from); // a steady pitch is not given a slide
    expect(note.start).toBeLessThan(0.05); // the 0.1 s of silence is gone
    expect(note.attack).toBeLessThan(0.02); // it started at once
    expect(note.floor).toBeLessThan(0.5); // and died away
    expect(sketch.hits).toBe(1);
    // The note carries the sound: anything else found is far beneath it.
    for (const other of sketch.layers) if (other.kind !== 'note') expect(other.target).toBeLessThan(notes[0].target / 3);
  });

  it('hears a burst of noise as noise layers, and no note', () => {
    const raw = noise(Math.round(0.4 * SR));
    const burst = new Float32Array(raw.length + SR / 10);
    for (let i = 0; i < raw.length; i++) burst[i + 2000] = 0.4 * raw[i] * Math.exp((-5 * i) / raw.length);
    const sketch = sketchFromRecording(burst, SR)!;
    expect(sketch.layers.filter(l => l.kind === 'note')).toHaveLength(0);
    expect(sketch.layers.length).toBeGreaterThanOrEqual(2);
    for (const part of sketch.layers) {
      expect(part.layer.source).toBe('noise');
      expect(part.layer.filters!.length).toBeGreaterThan(0);
      expect(part.target).toBeGreaterThan(0);
    }
    // White noise has most of its power high up: the wide high bands lead.
    const by = (kind: string) => sketch.layers.find(l => l.kind === kind)?.target ?? 0;
    expect(by('hiss')).toBeGreaterThan(by('body'));
  });

  it('keeps two separate hits apart, each with its own layers at its own time', () => {
    const first = ringingNote(330, 0.25, 0.05);
    const second = ringingNote(660, 0.25, 0.05);
    const both = new Float32Array(Math.round(1.2 * SR));
    both.set(first.subarray(0, Math.min(first.length, both.length)));
    both.set(second.subarray(0, Math.round(0.45 * SR)), Math.round(0.6 * SR));
    const sketch = sketchFromRecording(both, SR)!;
    expect(sketch.hits).toBe(2);
    const notes = sketch.layers.filter(l => l.kind === 'note').map(l => l.layer);
    const low = notes.find(n => Math.abs(n.pitch!.from - 330) < 10)!;
    const high = notes.find(n => Math.abs(n.pitch!.from - 660) < 15)!;
    expect(low).toBeDefined();
    expect(high).toBeDefined();
    expect(low.start).toBeLessThan(0.1);
    expect(high.start).toBeGreaterThan(0.5);
    expect(high.start).toBeLessThan(0.75);
    expect(new Set(sketch.layers.map(l => l.layer.id)).size).toBe(sketch.layers.length); // ids never collide
  });

  it('hears a pitch that falls as a slide', () => {
    const seconds = 0.7;
    const out = new Float32Array(Math.round((seconds + 0.1) * SR));
    let phase = 0;
    for (let i = 0; i < seconds * SR; i++) {
      const t = i / SR;
      const hz = 600 * Math.pow(480 / 600, t / seconds); // 600 Hz down to 480
      phase += (2 * Math.PI * hz) / SR;
      out[i + 1000] = 0.4 * Math.sin(phase) * Math.min(1, t / 0.05) * Math.min(1, (seconds - t) / 0.1);
    }
    const sketch = sketchFromRecording(out, SR)!;
    const note = sketch.layers.find(l => l.kind === 'note')!.layer;
    expect(note.pitch!.from).toBeGreaterThan(note.pitch!.to * 1.05);
    expect(note.attack).toBeGreaterThan(0.02); // it swelled in, it was not struck
  });

  it('uses no more than three seconds, and says how much there was', () => {
    const long = noise(SR * 5);
    for (let i = 0; i < long.length; i++) long[i] *= 0.2;
    const sketch = sketchFromRecording(long, SR)!;
    expect(sketch.seconds).toBeLessThanOrEqual(3.001);
    expect(sketch.heardSeconds).toBeGreaterThan(4.5);
    for (const part of sketch.layers) {
      expect(part.layer.start).toBeLessThanOrEqual(2);
      expect(part.layer.length).toBeLessThanOrEqual(3);
      expect(part.layer.attack).toBeLessThanOrEqual(part.layer.length);
      expect(part.layer.floor).toBeGreaterThan(0);
    }
  });

  it('gives a sound that keeps cutting in and out a tremble, and a steady one none', () => {
    const count = Math.round(1.2 * SR);
    const steady = noise(count);
    const crackle = noise(count, 7);
    for (let i = 0; i < count; i++) {
      steady[i] *= 0.3;
      // Twelve bursts a second: loud for a third of each, nearly silent between.
      crackle[i] *= ((i / SR) * 12) % 1 < 0.33 ? 0.4 : 0.03;
    }
    const wide = (s: ReturnType<typeof sketchFromRecording>) => s!.layers.filter(l => l.kind === 'grit' || l.kind === 'hiss');
    for (const part of wide(sketchFromRecording(steady, SR))) expect(part.layer.tremble).toBeUndefined();
    const rough = wide(sketchFromRecording(crackle, SR));
    expect(rough.length).toBeGreaterThan(0);
    for (const part of rough) {
      expect(part.layer.tremble).toBeDefined();
      expect(part.layer.tremble!.rate).toBeGreaterThanOrEqual(6);
      expect(part.layer.tremble!.rate).toBeLessThanOrEqual(24);
      expect(part.layer.tremble!.depth).toBeLessThanOrEqual(30);
    }
  });

  it('measures loudness in a band the same way every time', () => {
    const tone = ringingNote(1000, 0.5, 0, 0.5);
    const inBand = bandRms(tone, SR, 0, 0.5, 900, 1100);
    const outOfBand = bandRms(tone, SR, 0, 0.5, 3000, 5000);
    expect(inBand).toBeGreaterThan(outOfBand * 50);
    expect(bandRms(tone, SR, 0, 0.5, 900, 1100)).toBe(inBand);
  });
});
