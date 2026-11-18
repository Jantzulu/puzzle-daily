import { describe, expect, it } from 'vitest';
import {
  STEPS_PER_BAR, hzKey, isSong, keyHz, noteEvents, notePitch, noteSound, ringOut, songSeconds, soundRoot, stepSeconds,
  type SongTrack, type SynthSong,
} from '../../../../utils/synth/song';
import type { SynthSound } from '../../../../utils/synth/types';
import {
  DRUM_KIT, INSTRUMENTS, SCALES, addNote, drumTrack, fitNote, gridRows, inScale, keyName, kitRows, newSong, noteAt, noteCount, removeNote, replaceNote,
  scaleById, songReducer, trackFrom, withBars, type SongState,
} from '../songModel';

// A song (utils/synth/song.ts) is arithmetic on notes: when each starts,
// which key it is, what sound it is. All of that can be pinned without
// making any audio.

const tone = (hz: number, extra: Partial<SynthSound['layers'][number]> = {}): SynthSound => ({
  version: 1,
  level: 0.5,
  layers: [{ id: 'a', name: 'a', source: 'tone', start: 0, length: 0.4, level: 1, attack: 0.01, hold: 0.1, floor: 0.2, tail: 0.05, pitch: { from: hz, to: hz }, ...extra }],
});

const track = (extra: Partial<SongTrack> = {}): SongTrack => ({ id: 't1', name: 'Harp', instrument: tone(440), root: 69, level: 1, notes: [], ...extra });

const song = (extra: Partial<SynthSong> = {}): SynthSong => ({ version: 1, tempo: 120, length: 2 * STEPS_PER_BAR, level: 1, tracks: [track()], ...extra });

describe('a song: what plays when', () => {
  it('counts time in sixteenths of the tempo', () => {
    expect(stepSeconds({ tempo: 120 })).toBeCloseTo(0.125, 9); // a beat is half a second, a step a quarter of that
    expect(stepSeconds({ tempo: 60 })).toBeCloseTo(0.25, 9);
    expect(songSeconds(song())).toBeCloseTo(4, 9); // two bars of four beats at 120
    // A tempo out of range is brought into it, never divided by.
    expect(stepSeconds({ tempo: 0 })).toBeGreaterThan(0);
    expect(Number.isFinite(stepSeconds({ tempo: 1e9 }))).toBe(true);
  });

  it('counts pitch in piano keys', () => {
    expect(keyHz(69)).toBeCloseTo(440, 9);
    expect(keyHz(60)).toBeCloseTo(261.626, 2); // middle C
    expect(keyHz(81)).toBeCloseTo(880, 9);
    expect(hzKey(440)).toBe(69);
    expect(hzKey(262)).toBe(60);
  });

  it('knows the key a sound is written at: its loudest tone, or middle C for noise', () => {
    expect(soundRoot(tone(440))).toBe(69);
    expect(soundRoot(tone(523.25))).toBe(72);
    const two: SynthSound = { version: 1, level: 1, layers: [{ ...tone(220).layers[0], id: 'q', level: 0.2 }, { ...tone(880).layers[0], id: 'l', level: 0.9 }] };
    expect(soundRoot(two)).toBe(81);
    const drum: SynthSound = { version: 1, level: 1, layers: [{ id: 'n', name: 'n', source: 'noise', start: 0, length: 0.1, level: 1, attack: 0, hold: 0, floor: 0.1, tail: 0.01 }] };
    expect(soundRoot(drum)).toBe(60);
  });

  it('plays each note at its time, at the pitch of its key, in the order they start', () => {
    const s = song({ tracks: [track({ notes: [{ at: 8, length: 4, key: 81 }, { at: 0, length: 2, key: 69 }, { at: 4, length: 4, key: 57 }] })] });
    const events = noteEvents(s);
    expect(events.map(e => e.time)).toEqual([0, 0.5, 1]);
    expect(events.map(e => e.seconds)).toEqual([0.25, 0.5, 0.5]);
    expect(events[0].pitch).toBeCloseTo(1, 9); // the instrument's own key
    expect(events[1].pitch).toBeCloseTo(0.5, 9); // an octave down
    expect(events[2].pitch).toBeCloseTo(2, 9); // an octave up
  });

  it('leaves out silenced parts and notes that start outside the song', () => {
    const s = song({
      tracks: [
        track({ notes: [{ at: -1, length: 2, key: 60 }, { at: 0, length: 2, key: 60 }, { at: 32, length: 2, key: 60 }, { at: 31, length: 4, key: 62 }] }),
        track({ id: 't2', muted: true, notes: [{ at: 0, length: 1, key: 72 }] }),
        track({ id: 't3', level: 0, notes: [{ at: 0, length: 1, key: 72 }] }),
      ],
    });
    const events = noteEvents(s);
    expect(events.map(e => [e.track, e.note.at])).toEqual([[0, 0], [0, 31]]);
  });

  it('is the same every time', () => {
    const s = song({ tracks: [track({ notes: [{ at: 0, length: 4, key: 64 }, { at: 0, length: 4, key: 60 }, { at: 0, length: 4, key: 67 }] })] });
    expect(noteEvents(s)).toEqual(noteEvents(JSON.parse(JSON.stringify(s)) as SynthSong));
    expect(noteEvents(s).map(e => e.note.key)).toEqual([60, 64, 67]); // notes that start together: lowest first
  });

  it('makes a note as loud as the instrument, the part, the song and the note say', () => {
    const t = track({ level: 0.5 });
    expect(noteSound(t, { at: 0, length: 4, key: 69 }, 0.5).level).toBeCloseTo(0.25, 9);
    expect(noteSound(t, { at: 0, length: 4, key: 69, level: 0.5 }, 0.5, 2).level).toBeCloseTo(0.25, 9);
  });

  it('lets a struck instrument ring its own length, and holds a held one for as long as the note is drawn', () => {
    const struck = noteSound(track(), { at: 0, length: 16, key: 69 }, 2);
    expect(struck.layers[0].length).toBe(0.4); // the harp does not care how long the note is drawn
    const held = track({ held: true });
    const long = noteSound(held, { at: 0, length: 16, key: 69 }, 2).layers[0];
    expect(long.length).toBeCloseTo(2.05, 9); // the note, and its tail as a release
    expect(long.attack).toBe(0.01);
    expect(long.hold).toBe(0.1);
    const short = noteSound(held, { at: 0, length: 1, key: 69 }, 0.05).layers[0];
    expect(short.length).toBeCloseTo(0.1, 9);
    expect(short.attack + short.hold).toBeLessThanOrEqual(0.05 + 1e-9); // its start is squeezed into the note, never past it
    // The instrument itself is not changed by being played.
    expect(held.instrument.layers[0].length).toBe(0.4);
  });

  it('knows how long the last notes ring on', () => {
    expect(ringOut(song())).toBeCloseTo(0.4, 9); // a struck instrument: its whole length
    expect(ringOut(song({ tracks: [track({ held: true })] }))).toBeCloseTo(0.05, 9); // a held one: only its tail
  });

  it('tells a song from something that is not one', () => {
    expect(isSong(song())).toBe(true);
    expect(isSong(newSong())).toBe(true);
    expect(isSong(null)).toBe(false);
    expect(isSong({ tempo: 120, length: 16 })).toBe(false);
    expect(isSong({ version: 1, level: 1, layers: [] })).toBe(false); // a sound
    expect(isSong({ ...song(), tracks: [{ id: 'x', notes: [{ at: 0 }], instrument: tone(440) }] })).toBe(false);
  });
});

describe('a drum part', () => {
  it('is a kit of eight drums, each a sound of its own, one to a row', () => {
    const drums = drumTrack();
    expect(drums.kit).toHaveLength(8);
    expect(new Set(drums.kit!.map(d => d.key)).size).toBe(8);
    // Cymbals at the top of the grid, the kick at the bottom.
    expect(kitRows(drums).map(r => r.label)).toEqual(['Crash', 'Open hat', 'Hat', 'Clap', 'High tom', 'Low tom', 'Snare', 'Kick']);
    expect(kitRows(drums).map(r => r.key)).toEqual(DRUM_KIT.map(d => d.key));
    expect(isSong(song({ tracks: [drums] }))).toBe(true);
    for (const drum of drums.kit!) {
      expect(drum.sound.layers.length).toBeGreaterThan(0);
      for (const layer of drum.sound.layers) {
        expect(layer.length).toBeGreaterThan(0);
        expect(layer.tail).toBeLessThan(layer.length);
      }
    }
  });

  it('plays the drum a note is on, as it is: not higher or lower', () => {
    const drums = { ...drumTrack(), notes: [{ at: 0, length: 1, key: 36 }, { at: 4, length: 1, key: 38 }, { at: 4, length: 1, key: 99 }] };
    const events = noteEvents(song({ tracks: [drums] }));
    // The note on a key with no drum plays nothing.
    expect(events.map(e => [e.note.key, e.pitch])).toEqual([[36, 1], [38, 1]]);
    expect(notePitch(drums, 49)).toBe(1);
    const kick = drums.kit!.find(d => d.key === 36)!.sound;
    const snare = drums.kit!.find(d => d.key === 38)!.sound;
    expect(noteSound(drums, drums.notes[0], 0.125).layers).toEqual(kick.layers);
    expect(noteSound(drums, drums.notes[1], 0.125).layers).toEqual(snare.layers);
    // A soft hit, on a part turned down, in a song turned down.
    expect(noteSound({ ...drums, level: 0.5 }, { at: 0, length: 1, key: 36, level: 0.5 }, 0.125, 0.5).level).toBeCloseTo(0.125, 9);
  });

  it('rings on after the end for as long as its longest drum', () => {
    const drums = drumTrack();
    const crash = drums.kit!.find(d => d.key === 49)!.sound;
    expect(ringOut(song({ tracks: [drums] }))).toBeCloseTo(crash.layers[0].length, 6);
  });
});

describe('the song editor: scales and rows', () => {
  it('shows only the keys of the scale, highest first', () => {
    const major = scaleById('major');
    const rows = gridRows(60, 72, 0, major, []);
    expect(rows.map(r => keyName(r.key))).toEqual(['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4']);
    expect(rows.every(r => !r.stray)).toBe(true);
  });

  it('moves with the home note', () => {
    const major = scaleById('major');
    expect(inScale(66, 2, major)).toBe(true); // F# belongs to D major
    expect(inScale(65, 2, major)).toBe(false); // F does not
    expect(gridRows(60, 72, 2, major, []).map(r => keyName(r.key))).toEqual(['B4', 'A4', 'G4', 'F#4', 'E4', 'D4', 'C#4']);
  });

  it('keeps a row for any key that already has a note on it, marked as outside the scale', () => {
    const rows = gridRows(60, 64, 0, scaleById('major'), [{ at: 0, length: 1, key: 61 }]);
    expect(rows.map(r => [keyName(r.key), r.stray])).toEqual([['E4', false], ['D4', false], ['C#4', true], ['C4', false]]);
  });

  it('has scales that are real ones, and falls back to the first for a name it does not know', () => {
    for (const scale of SCALES) {
      expect(scale.keys[0]).toBe(0);
      expect(new Set(scale.keys).size).toBe(scale.keys.length);
      expect(scale.keys.every(k => k >= 0 && k < 12)).toBe(true);
    }
    expect(scaleById('all').keys).toHaveLength(12);
    expect(scaleById('nonsense')).toBe(SCALES[0]);
  });
});

describe('the song editor: notes', () => {
  const length = 2 * STEPS_PER_BAR;

  it('finds the note under a square', () => {
    const notes = [{ at: 4, length: 4, key: 60 }];
    expect(noteAt(notes, 60, 4)).toBe(notes[0]);
    expect(noteAt(notes, 60, 7)).toBe(notes[0]);
    expect(noteAt(notes, 60, 8)).toBeUndefined(); // the square after its end
    expect(noteAt(notes, 62, 5)).toBeUndefined();
  });

  it('fits a note to whole squares, inside the song, short of the next note on its key', () => {
    expect(fitNote({ at: 3.4, length: 2.6, key: 60.2 }, length, [])).toEqual({ at: 3, length: 3, key: 60 });
    expect(fitNote({ at: 30, length: 8, key: 60 }, length, [])).toEqual({ at: 30, length: 2, key: 60 }); // cut at the end of the song
    expect(fitNote({ at: 99, length: 1, key: 60 }, length, []).at).toBe(31);
    expect(fitNote({ at: 0, length: 8, key: 60 }, length, [{ at: 4, length: 2, key: 60 }]).length).toBe(4);
    expect(fitNote({ at: 0, length: 8, key: 60 }, length, [{ at: 4, length: 2, key: 62 }]).length).toBe(8); // another key is not in the way
    expect(fitNote({ at: 0, length: 0, key: 60 }, length, []).length).toBe(1);
  });

  it('adds, moves, stretches and removes without changing the list it was given', () => {
    const notes = [{ at: 0, length: 4, key: 60 }];
    const added = addNote(notes, { at: 8, length: 4, key: 64 }, length);
    expect(added).toHaveLength(2);
    expect(notes).toHaveLength(1);
    const moved = replaceNote(added, added[1], { ...added[1], at: 12, key: 67 }, length);
    expect(moved.map(n => [n.at, n.key])).toEqual([[0, 60], [12, 67]]);
    const stretched = replaceNote(moved, moved[0], { ...moved[0], length: 8 }, length);
    expect(stretched[0].length).toBe(8);
    expect(removeNote(stretched, stretched[0]).map(n => n.key)).toEqual([67]);
  });

  it('does not let a note be moved onto another on the same key', () => {
    const notes = [{ at: 0, length: 4, key: 60 }, { at: 8, length: 4, key: 60 }];
    expect(replaceNote(notes, notes[1], { ...notes[1], at: 2 }, length)).toEqual(notes);
  });

  it('shortens and lengthens a song by bars, dropping what no longer fits', () => {
    const s = song({ tracks: [track({ notes: [{ at: 0, length: 4, key: 60 }, { at: 14, length: 8, key: 62 }, { at: 20, length: 2, key: 64 }] })] });
    const shorter = withBars(s, 1);
    expect(shorter.length).toBe(STEPS_PER_BAR);
    expect(shorter.tracks[0].notes).toEqual([{ at: 0, length: 4, key: 60 }, { at: 14, length: 2, key: 62 }]);
    expect(withBars(s, 4).length).toBe(4 * STEPS_PER_BAR);
    expect(withBars(s, 0).length).toBe(STEPS_PER_BAR); // never shorter than a bar
    expect(noteCount(s)).toBe(3);
  });

  it('starts every instrument from a sound whose key it knows', () => {
    expect(new Set(INSTRUMENTS.map(i => i.id)).size).toBe(INSTRUMENTS.length);
    for (const instrument of INSTRUMENTS) {
      const made = trackFrom(instrument.label, instrument.make(), instrument.held);
      expect(made.instrument.layers.length).toBeGreaterThan(0);
      expect(made.root).toBe(soundRoot(made.instrument));
      expect(made.root).toBeGreaterThan(20);
      expect(made.notes).toEqual([]);
    }
    const fresh = newSong();
    expect(fresh.tracks).toHaveLength(1);
    expect(fresh.length % STEPS_PER_BAR).toBe(0);
  });
});

describe('the song editor: undo', () => {
  const start = (): SongState => songReducer({ work: {}, stamp: null }, { type: 'open', id: 'a', name: 'A', song: song() });
  const withTempo = (tempo: number) => song({ tempo });

  it('undoes and redoes an edit', () => {
    let s = start();
    s = songReducer(s, { type: 'edit', id: 'a', song: withTempo(90), tag: 'tempo', time: 0 });
    expect(s.work.a.song.tempo).toBe(90);
    s = songReducer(s, { type: 'undo', id: 'a' });
    expect(s.work.a.song.tempo).toBe(120);
    s = songReducer(s, { type: 'redo', id: 'a' });
    expect(s.work.a.song.tempo).toBe(90);
  });

  it('treats one drag as one step, and separate taps as separate steps', () => {
    let s = start();
    for (let i = 1; i <= 5; i++) s = songReducer(s, { type: 'edit', id: 'a', song: withTempo(120 + i), tag: 'drag:1', time: i * 2000, sticky: true });
    expect(s.work.a.past).toHaveLength(1);
    s = songReducer(s, { type: 'edit', id: 'a', song: withTempo(200), tag: 'draw:2', time: 20000 });
    s = songReducer(s, { type: 'edit', id: 'a', song: withTempo(210), tag: 'draw:3', time: 20010 });
    expect(s.work.a.past).toHaveLength(3);
  });

  it('keeps each open song its own working copy', () => {
    let s = start();
    s = songReducer(s, { type: 'open', id: 'b', name: 'B', song: withTempo(70) });
    s = songReducer(s, { type: 'edit', id: 'a', song: withTempo(99), tag: 't', time: 0 });
    s = songReducer(s, { type: 'rename', id: 'b', name: 'Bee' });
    expect(s.work.a.song.tempo).toBe(99);
    expect(s.work.b.song.tempo).toBe(70);
    expect(s.work.b.name).toBe('Bee');
    // Opening one that is already open does not throw its edits away.
    s = songReducer(s, { type: 'open', id: 'a', name: 'A', song: song() });
    expect(s.work.a.song.tempo).toBe(99);
    s = songReducer(s, { type: 'drop', id: 'a' });
    expect(s.work.a).toBeUndefined();
  });
});
