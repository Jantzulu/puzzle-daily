import { describe, expect, it } from 'vitest';
import { MidiError, readMidi } from '../../../../utils/synth/midi';
import { STEPS_PER_BAR, isSong } from '../../../../utils/synth/song';
import { drumFor, instrumentFor, songFromMidi } from '../importMidi';

// A MIDI file is a few plain bytes, so the ones used here are written out by
// hand: what is in them is known exactly.

/** A number as MIDI writes times: seven bits to a byte, high bit set on all but the last. */
function varLen(value: number): number[] {
  const out = [value & 0x7f];
  for (let v = value >> 7; v > 0; v >>= 7) out.unshift((v & 0x7f) | 0x80);
  return out;
}
const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const text = (s: string) => Array.from(s, c => c.charCodeAt(0));
const chunk = (tag: string, data: number[]) => [...text(tag), ...u32(data.length), ...data];
const header = (tracks: number, division: number, format = 1) => chunk('MThd', [0, format, (tracks >> 8) & 255, tracks & 255, (division >> 8) & 255, division & 255]);
/** An event: wait `delta` ticks, then these bytes. */
const ev = (delta: number, ...bytes: number[]) => [...varLen(delta), ...bytes];
const END = ev(0, 0xff, 0x2f, 0);
const tempo = (delta: number, microseconds: number) => ev(delta, 0xff, 0x51, 3, (microseconds >> 16) & 255, (microseconds >> 8) & 255, microseconds & 255);
const file = (...chunks: number[][]) => new Uint8Array(chunks.flat());

const BEAT = 480;

/** Two tracks: one that only sets the speed (twice), one with a flute tune and a few drum hits. */
const tune = () => file(
  header(2, BEAT),
  chunk('MTrk', [...tempo(0, 500000), ...tempo(BEAT * 8, 400000), ...END]),
  chunk('MTrk', [
    ...ev(0, 0xff, 0x03, 6, ...text('Melody')),
    ...ev(0, 0xc0, 73), // channel 1 is a flute
    ...ev(0, 0x90, 60, 100), // C4 down
    ...ev(BEAT, 0x80, 60, 0), // ...and up a beat later
    ...ev(0, 0x90, 64, 80), // E4 down
    ...ev(BEAT / 2, 64, 0), // "running status": no kind given, so it is another note-on; struck at 0 = lifted
    ...ev(0, 0x99, 36, 110), // channel 10: a drum
    ...ev(60, 0x89, 36, 0),
    ...ev(BEAT * 2, 0x90, 67, 127), // G4, never lifted: held to the end
    ...ev(BEAT, 0xb0, 7, 100), // a volume control: stepped over
    ...END,
  ]),
);

describe('reading a MIDI file', () => {
  it('reads the notes, the instrument, the name and the speed', () => {
    const midi = readMidi(tune());
    expect(midi.ticksPerBeat).toBe(BEAT);
    expect(midi.tempo).toBeCloseTo(120, 6);
    expect(midi.tempoChanges).toBe(1);
    expect(midi.parts.map(p => [p.name, p.channel, p.program])).toEqual([['Melody', 0, 73], ['Melody', 9, 0]]);
    expect(midi.parts[0].notes).toEqual([
      { tick: 0, ticks: BEAT, key: 60, velocity: 100 },
      { tick: BEAT, ticks: BEAT / 2, key: 64, velocity: 80 },
      { tick: BEAT * 1.5 + 60 + BEAT * 2, ticks: BEAT, key: 67, velocity: 127 },
    ]);
    expect(midi.parts[1].notes).toEqual([{ tick: BEAT * 1.5, ticks: 60, key: 36, velocity: 110 }]);
  });

  it('ends a note where the same key is struck again', () => {
    const midi = readMidi(file(header(1, BEAT, 0), chunk('MTrk', [...ev(0, 0x90, 60, 90), ...ev(BEAT, 0x90, 60, 90), ...ev(BEAT, 0x80, 60, 0), ...END])));
    expect(midi.parts[0].notes.map(n => [n.tick, n.ticks])).toEqual([[0, BEAT], [BEAT, BEAT]]);
    expect(midi.tempo).toBe(120); // no speed given: the usual one
  });

  it('refuses what it cannot read, saying why', () => {
    expect(() => readMidi(new Uint8Array(text('RIFF....WAVE')))).toThrow(MidiError);
    expect(() => readMidi(new Uint8Array(0))).toThrow(MidiError);
    expect(() => readMidi(file(header(1, 0xe728)))).toThrow(/film frames/);
    const whole = tune();
    expect(() => readMidi(whole.subarray(0, whole.length - 9))).not.toThrow(); // a track cut short: what is there is read
    expect(() => readMidi(whole.subarray(0, 30))).toThrow(MidiError); // cut inside a number
  });
});

describe('a song from a MIDI file', () => {
  it('puts the notes on the grid, on an instrument of the same family', () => {
    const { song, summary } = songFromMidi(readMidi(tune()));
    expect(isSong(song)).toBe(true);
    expect(song.tempo).toBe(120);
    expect(song.tracks).toHaveLength(2); // the tune, and the drums
    const part = song.tracks[0];
    expect(part.name).toBe('Melody');
    expect(part.held).toBe(true); // a flute holds its notes
    expect(part.notes).toEqual([
      { at: 0, length: 4, key: 60, level: 1.05 }, // a beat is four squares
      { at: 4, length: 2, key: 64, level: 0.85 },
      { at: 15, length: 4, key: 67, level: 1.3 }, // it began half-way between two squares: moved to the later one
    ]);
    expect(song.length % STEPS_PER_BAR).toBe(0);
    expect(song.length).toBe(2 * STEPS_PER_BAR);
    expect(summary).toMatch(/2 parts, 4 notes, 2 bars at 120/);
    expect(summary).toMatch(/drums are played on the Forge's kit/);
    expect(summary).toMatch(/changes of speed/);
  });

  it('shows the scale the tune keeps to, and every key when it keeps to none', () => {
    const inC = songFromMidi(readMidi(tune())).song;
    expect(inC.view).toMatchObject({ scale: 'major', home: 0 });
    expect(inC.view!.low).toBeLessThanOrEqual(60);
    expect(inC.view!.high).toBeGreaterThan(67);
    const chromatic = file(header(1, BEAT, 0), chunk('MTrk', [
      ...[60, 61, 62, 63, 64, 65, 66].flatMap(key => [...ev(0, 0x90, key, 90), ...ev(BEAT, 0x80, key, 0)]),
      ...END,
    ]));
    expect(songFromMidi(readMidi(chromatic)).song.view!.scale).toBe('all');
  });

  it('moves notes that fall between the squares to the nearest, and says so', () => {
    // Triplets: three notes to a beat.
    const third = BEAT / 3;
    const triplets = file(header(1, BEAT, 0), chunk('MTrk', [
      ...[60, 62, 64, 65, 67, 69].flatMap(key => [...ev(0, 0x90, key, 90), ...ev(third, 0x80, key, 0)]),
      ...END,
    ]));
    const { song, summary } = songFromMidi(readMidi(triplets));
    expect(song.tracks[0].notes.map(n => n.at)).toEqual([0, 1, 3, 4, 5, 7]);
    for (const note of song.tracks[0].notes) expect(note.length).toBeGreaterThanOrEqual(1);
    expect(summary).toMatch(/between the squares/);
  });

  it('starts at the bar of the first note, leaving the silence before it behind', () => {
    const late = file(header(1, BEAT, 0), chunk('MTrk', [...ev(BEAT * 9, 0x90, 60, 96), ...ev(BEAT, 0x80, 60, 0), ...END]));
    const { song } = songFromMidi(readMidi(late));
    expect(song.tracks[0].notes).toEqual([{ at: 4, length: 4, key: 60 }]); // beat ten is the second beat of bar three
    expect(song.length).toBe(STEPS_PER_BAR);
  });

  it('puts the drums on the kit: one part, each hit on the nearest of its eight drums', () => {
    const { song } = songFromMidi(readMidi(tune()));
    const drums = song.tracks[1];
    expect(drums.name).toBe('Drums');
    expect(drums.kit).toHaveLength(8);
    // The kick struck at a beat and a half (square 6), a little harder than firm.
    expect(drums.notes).toEqual([{ at: 6, length: 1, key: 36, level: 1.15 }]);
    // The scale is read from the tune alone: a drum's key is not a pitch.
    expect(song.view).toMatchObject({ scale: 'major', home: 0 });

    // General MIDI's many drums, on the kit's eight.
    expect([35, 36].map(drumFor)).toEqual([36, 36]);
    expect([37, 38, 40].map(drumFor)).toEqual([38, 38, 38]);
    expect([42, 44, 51].map(drumFor)).toEqual([42, 42, 42]);
    expect(drumFor(46)).toBe(46);
    expect([49, 57].map(drumFor)).toEqual([49, 49]);
    expect([41, 47, 48, 50].map(drumFor)).toEqual([45, 45, 50, 50]);
    expect(drumFor(39)).toBe(39);
    expect(drumFor(81)).toBeNull(); // a triangle: nothing like it in the kit
  });

  it('makes a song of a file that is drums alone', () => {
    const beat = file(header(1, BEAT, 0), chunk('MTrk', [
      ...ev(0, 0x99, 36, 96), ...ev(0, 0x99, 42, 96), // kick and hat together
      ...ev(BEAT, 0x99, 38, 96), ...ev(0, 0x99, 42, 96), // snare and hat a beat later
      ...ev(0, 0x99, 81, 96), // and a triangle, which the kit has not got
      ...END,
    ]));
    const { song } = songFromMidi(readMidi(beat));
    expect(isSong(song)).toBe(true);
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0].notes).toEqual([
      { at: 0, length: 1, key: 36 }, { at: 0, length: 1, key: 42 },
      { at: 4, length: 1, key: 38 }, { at: 4, length: 1, key: 42 },
    ]);
    expect(song.length).toBe(STEPS_PER_BAR);
  });

  it('says so when there is nothing it can play', () => {
    expect(() => songFromMidi(readMidi(file(header(1, BEAT, 0), chunk('MTrk', END))))).toThrow('no notes');
    const triangleOnly = file(header(1, BEAT, 0), chunk('MTrk', [...ev(0, 0x99, 81, 100), ...ev(60, 0x89, 81, 0), ...END]));
    expect(() => songFromMidi(readMidi(triangleOnly))).toThrow('no notes');
  });

  it('picks an instrument by family', () => {
    expect(instrumentFor(0).id).toBe('pluck'); // a piano
    expect(instrumentFor(19).id).toBe('organ');
    expect(instrumentFor(48).id).toBe('strings');
    expect(instrumentFor(56).id).toBe('horn'); // a trumpet
    expect(instrumentFor(73).id).toBe('flute');
    expect(instrumentFor(80).id).toBe('lead');
    expect(instrumentFor(999).id).toBe(instrumentFor(127).id); // out of range: brought into it
  });
});
