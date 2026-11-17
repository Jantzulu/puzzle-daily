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

  it('hears notes played one after another as separate notes, each starting when it does', () => {
    // Three plucked notes a quarter of a second apart, each still ringing
    // when the next begins: no silence between them, so they are one "hit".
    const run = new Float32Array(Math.round(1.3 * SR));
    [392, 494, 587].forEach((hz, n) => {
      const start = Math.round((0.05 + n * 0.25) * SR);
      for (let i = 0; start + i < run.length; i++) {
        const t = i / SR;
        run[start + i] += 0.3 * Math.sin(2 * Math.PI * hz * t) * Math.exp(-5 * t);
      }
    });
    const sketch = sketchFromRecording(run, SR)!;
    const notes = sketch.layers.filter(l => l.kind === 'note').map(l => l.layer).sort((a, b) => a.start - b.start);
    expect(notes).toHaveLength(3);
    expect(notes.map(n => Math.round(n.pitch!.from / 10) * 10)).toEqual([390, 490, 590]);
    expect(notes[1].start - notes[0].start).toBeGreaterThan(0.18);
    expect(notes[1].start - notes[0].start).toBeLessThan(0.32);
    expect(notes[2].start - notes[1].start).toBeGreaterThan(0.18);
    expect(notes[2].start - notes[1].start).toBeLessThan(0.32);
  });

  it('keeps a note and its overtones together as one layer', () => {
    // One plucked string: 220 Hz with its 2nd and 3rd overtones.
    const pluck = new Float32Array(Math.round(0.9 * SR));
    for (let i = 0; i < 0.8 * SR; i++) {
      const t = i / SR;
      const fade = Math.exp(-4 * t);
      pluck[i + 500] = fade * (0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 440 * t) + 0.1 * Math.sin(2 * Math.PI * 660 * t));
    }
    const sketch = sketchFromRecording(pluck, SR)!;
    const notes = sketch.layers.filter(l => l.kind === 'note').map(l => l.layer);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch!.from).toBeGreaterThan(215);
    expect(notes[0].pitch!.from).toBeLessThan(225);
    const ratios = (notes[0].harmonics ?? []).map(h => Math.round(h.ratio)).sort();
    expect(ratios).toEqual([2, 3]);
    for (const h of notes[0].harmonics!) expect(h.level).toBeLessThan(1); // quieter than the note itself
  });

  it('hears a phrase on a plucked instrument as its notes, with no noise behind them', () => {
    // Four plucked strings a fifth of a second apart. Each is a note with a
    // stack of eight overtones, the second and third STRONGER than the note
    // itself (as on a harpsichord's low strings), all dying away together.
    const pitches = [98, 147, 196, 131];
    const strength = [0.4, 1, 0.8, 0.5, 0.3, 0.25, 0.15, 0.1];
    const phrase = new Float32Array(Math.round(1.3 * SR));
    pitches.forEach((hz, n) => {
      const start = Math.round((0.03 + n * 0.2) * SR);
      for (let i = 0; start + i < phrase.length; i++) {
        const t = i / SR;
        let v = 0;
        strength.forEach((a, m) => { v += a * Math.sin(2 * Math.PI * hz * (m + 1) * t); });
        phrase[start + i] += 0.08 * v * Math.exp(-7 * t);
      }
    });
    const sketch = sketchFromRecording(phrase, SR)!;
    const notes = sketch.layers.filter(l => l.kind === 'note').map(l => l.layer).sort((a, b) => a.start - b.start);
    // The melody: the four notes themselves, in order, not their overtones.
    expect(notes.map(n => Math.round(n.pitch!.from))).toEqual(pitches);
    for (let n = 1; n < notes.length; n++) {
      expect(notes[n].start - notes[n - 1].start).toBeGreaterThan(0.15);
      expect(notes[n].start - notes[n - 1].start).toBeLessThan(0.25);
    }
    for (const note of notes) {
      // Each carries overtones at whole multiples, the strongest louder than the note.
      expect(note.harmonics!.length).toBeGreaterThanOrEqual(3);
      for (const h of note.harmonics!) expect(Number.isInteger(h.ratio)).toBe(true);
      expect(Math.max(...note.harmonics!.map(h => h.level))).toBeGreaterThan(1);
    }
    // And the timbre is not mistaken for noise.
    expect(sketch.layers.filter(l => l.kind !== 'note')).toHaveLength(0);
  });

  it('does not take a rumble that favours a pitch for a note', () => {
    // Noise ringing a resonance at 270 Hz for as long as it lasts: it has a
    // pitch, but it is not struck and does not die away.
    const raw = noise(Math.round(1.6 * SR), 99);
    const rumble = new Float32Array(raw.length);
    const r = 0.997;
    const turn = (2 * Math.PI * 270) / SR;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < raw.length; i++) {
      const y = raw[i] * 0.01 + 2 * r * Math.cos(turn) * y1 - r * r * y2;
      y2 = y1;
      y1 = y;
      rumble[i] = y;
    }
    const sketch = sketchFromRecording(rumble, SR)!;
    expect(sketch.layers.filter(l => l.kind === 'note')).toHaveLength(0);
    expect(sketch.layers.some(l => l.kind === 'body')).toBe(true); // it is there, as noise in its band
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

  it('hears a sparkle of many small bells as notes that rise, with no noise and no slides', () => {
    // A soft low run of eight bells, then a hundred and twenty small ones,
    // eighty a second, each a twentieth of a second long, on a scale of
    // fixed pitches 2.7% apart, climbing. Far more notes than there is room
    // for, and close enough together for a followed pitch to step from one
    // bell onto the next.
    const cloud = new Float32Array(Math.round(2.2 * SR));
    const bell = (hz: number, at: number, level: number, fade: number) => {
      const start = Math.round(at * SR);
      for (let i = 0; i < 0.15 * SR && start + i < cloud.length; i++) {
        const s = i / SR;
        cloud[start + i] += level * Math.sin(2 * Math.PI * hz * s) * Math.min(1, s / 0.002) * Math.exp(-fade * s);
      }
    };
    for (let n = 0; n < 8; n++) bell(900 * Math.pow(1.09, n), 0.03 + n * 0.05, 0.03, 12);
    const scale = Array.from({ length: 24 }, (_, n) => 2300 * Math.pow(1.027, n));
    for (let n = 0; n < 120; n++) {
      const step = Math.min(scale.length - 1, Math.floor(n / 6) + [0, 2, 1, 3][n % 4]);
      bell(scale[step], 0.45 + n * 0.0125, 0.2, 50);
    }
    const sketch = sketchFromRecording(cloud, SR)!;
    // Nothing but notes: what there was no room to name is NOT made up in noise.
    expect(sketch.layers.filter(l => l.kind !== 'note')).toHaveLength(0);
    const notes = sketch.layers.map(l => l.layer).sort((p, q) => p.start - q.start);
    expect(notes.length).toBeGreaterThanOrEqual(8);
    expect(notes.length).toBeLessThanOrEqual(20);
    // Every bell stands on its pitch: stepping from one to the next is not a slide.
    for (const note of notes) expect(note.pitch!.to).toBe(note.pitch!.from);
    // It rises: the soft opening is there, low, before the bright run begins.
    const opening = notes.filter(n => n.start < 0.4);
    expect(opening.length).toBeGreaterThanOrEqual(2);
    for (const note of opening) expect(note.pitch!.from).toBeLessThan(1800);
    const late = notes.filter(n => n.start > 1.2).map(n => n.pitch!.from);
    expect(late.length).toBeGreaterThan(0);
    expect(Math.min(...late)).toBeGreaterThan(2500);
  });

  it('gives a note that beats in strict time a pulse, not a tremble, and lets it swell in', () => {
    // A steady tone swelling in over a quarter of a second, its loudness
    // going up and down ten times a second.
    const seconds = 1.2;
    const tone = new Float32Array(Math.round((seconds + 0.1) * SR));
    for (let i = 0; i < seconds * SR; i++) {
      const t = i / SR;
      const beat = 1 + 0.5 * Math.sin(2 * Math.PI * 10 * t);
      tone[i + 500] = 0.3 * Math.sin(2 * Math.PI * 880 * t) * beat * Math.min(1, t / 0.25) * Math.min(1, (seconds - t) / 0.2);
    }
    const sketch = sketchFromRecording(tone, SR)!;
    const notes = sketch.layers.filter(l => l.kind === 'note').map(l => l.layer);
    expect(notes).toHaveLength(1);
    expect(notes[0].tremble).toBeUndefined();
    expect(notes[0].pulse).toBeDefined();
    expect(notes[0].pulse!.rate).toBeGreaterThan(9);
    expect(notes[0].pulse!.rate).toBeLessThan(11);
    expect(notes[0].pulse!.depth).toBeGreaterThan(0.3);
    expect(notes[0].pulse!.depth).toBeLessThan(0.75);
    // It swelled in: the top of its first beat is not the note arriving.
    expect(notes[0].attack).toBeGreaterThan(0.1);
  });

  it('never gives noise a pulse, however regular its bursts', () => {
    const count = Math.round(1.2 * SR);
    const chug = noise(count, 7);
    for (let i = 0; i < count; i++) chug[i] *= 0.25 * (1 + 0.8 * Math.sin((2 * Math.PI * 9 * i) / SR));
    const sketch = sketchFromRecording(chug, SR)!;
    expect(sketch.layers.length).toBeGreaterThan(0);
    for (const part of sketch.layers) expect(part.layer.pulse).toBeUndefined();
  });

  it('keeps a pitch that is a whole multiple but goes its own way as a layer of its own', () => {
    // A drone held for a second, and a pitch exactly three times it that
    // starts with it and is gone in a third of the time.
    const both = new Float32Array(Math.round(1.2 * SR));
    for (let i = 0; i < 1.0 * SR; i++) {
      const t = i / SR;
      const edge = Math.min(1, t / 0.02) * Math.min(1, (1.0 - t) / 0.05);
      both[i + 500] = 0.3 * Math.sin(2 * Math.PI * 300 * t) * edge + 0.3 * Math.sin(2 * Math.PI * 900 * t) * Math.min(1, t / 0.02) * Math.exp(-12 * t);
    }
    const sketch = sketchFromRecording(both, SR)!;
    const notes = sketch.layers.filter(l => l.kind === 'note').map(l => l.layer).sort((a, b) => a.pitch!.from - b.pitch!.from);
    expect(notes).toHaveLength(2);
    expect(Math.round(notes[0].pitch!.from / 10) * 10).toBe(300);
    expect(Math.round(notes[1].pitch!.from / 10) * 10).toBe(900);
    expect(notes[0].harmonics ?? []).toHaveLength(0);
    expect(notes[1].length).toBeLessThan(notes[0].length * 0.7);
  });

  it('hears a stream of small notes as one layer that runs through them', () => {
    // One voice, thirty notes a second for a second and a half: up three
    // keys, up two, down three, climbing two octaves and more. Each note is
    // struck and all but gone before the one after next.
    const first = 900;
    const keys: number[] = [];
    for (let n = 0; n < 45; n++) keys.push(Math.floor(n / 3) * 2 + [0, 3, 5][n % 3]);
    const stream = new Float32Array(Math.round(1.8 * SR));
    keys.forEach((key, n) => {
      const hz = first * Math.pow(2, key / 12);
      const start = Math.round((0.05 + n / 30) * SR);
      for (let i = 0; i < 0.2 * SR && start + i < stream.length; i++) {
        const s = i / SR;
        stream[start + i] += 0.25 * Math.sin(2 * Math.PI * hz * s) * Math.min(1, s / 0.002) * Math.exp(-45 * s);
      }
    });
    const sketch = sketchFromRecording(stream, SR)!;
    const runs = sketch.layers.map(l => l.layer).filter(l => l.run);
    expect(runs).toHaveLength(1);
    const layer = runs[0];
    expect(layer.source).toBe('tone');
    expect(layer.pitch!.to).toBe(layer.pitch!.from);
    expect(Math.abs(12 * Math.log2(layer.pitch!.from / first))).toBeLessThan(0.3); // it starts on the first note
    expect(layer.start).toBeLessThan(0.1);
    expect(layer.length).toBeGreaterThan(1.3);
    expect(layer.run!.rate).toBeGreaterThan(27);
    expect(layer.run!.rate).toBeLessThan(33);
    const steps = layer.run!.steps;
    expect(steps.length).toBeGreaterThanOrEqual(40);
    expect(steps.length).toBeLessThanOrEqual(50);
    expect(steps[0]).toBe(0);
    // The tune: most steps are on the note that was played at that moment.
    let right = 0;
    steps.forEach((step, i) => { if (keys[i] !== undefined && Math.abs(step - keys[i]) < 0.4) right++; });
    expect(right).toBeGreaterThan(steps.length * 0.8);
    // It goes up AND down on the way.
    expect(steps.some((step, i) => i > 0 && step < steps[i - 1] - 1)).toBe(true);
    expect(steps[steps.length - 1]).toBeGreaterThan(24);
    // And nothing of it is made up in noise.
    expect(sketch.layers.filter(l => l.kind !== 'note')).toHaveLength(0);
  });

  it('does not take a held chord whose notes are struck again in turn for a run', () => {
    // Five pitches sounding all the while, each struck again every sixth of
    // a second, one after another: thirty strikes a second, but no note
    // ever dies away. These are notes that pulse.
    const chord = [600, 840, 1175, 1860, 2100];
    const held = new Float32Array(Math.round(1.6 * SR));
    chord.forEach((hz, c) => {
      for (let i = 0; i < 1.5 * SR; i++) {
        const s = i / SR;
        const sinceStruck = (((s - c / 30) % (1 / 6)) + 1 / 6) % (1 / 6);
        const beat = 0.45 + 0.55 * Math.exp(-25 * sinceStruck);
        held[i + 400] += 0.1 * Math.sin(2 * Math.PI * hz * s) * beat * Math.min(1, s / 0.05) * Math.min(1, (1.5 - s) / 0.1);
      }
    });
    const sketch = sketchFromRecording(held, SR)!;
    expect(sketch.layers.filter(l => l.layer.run)).toHaveLength(0);
    // It is still heard, as notes.
    expect(sketch.layers.filter(l => l.kind === 'note').length).toBeGreaterThanOrEqual(4);
  });

  it('measures loudness in a band the same way every time', () => {
    const tone = ringingNote(1000, 0.5, 0, 0.5);
    const inBand = bandRms(tone, SR, 0, 0.5, 900, 1100);
    const outOfBand = bandRms(tone, SR, 0, 0.5, 3000, 5000);
    expect(inBand).toBeGreaterThan(outOfBand * 50);
    expect(bandRms(tone, SR, 0, 0.5, 900, 1100)).toBe(inBand);
  });
});
