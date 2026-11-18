// What the song editor knows that the player does not: the scales that pick
// which rows the grid shows, the instruments a new track can start from,
// what a new song is, and the small edits (add, move, stretch, remove a
// note). Plain functions: no React, no audio, so they can be tested.

import { HIGHEST_KEY, LOWEST_KEY, MAX_BARS, STEPS_PER_BAR, soundRoot, type SongNote, type SongTrack, type SynthSong } from '../../../utils/synth/song';
import type { SynthLayer, SynthSound } from '../../../utils/synth/types';
import { LAYER_STARTERS, NOTE_NAMES } from './forgeModel';

// ---- scales -----------------------------------------------------------------------
// A scale is the set of keys a tune keeps to. Showing only those rows is the
// answer to "picking notes one by one is slow": with seven rows to an octave
// instead of twelve, and none of them wrong, a tune can be tapped in.

export interface Scale {
  id: string;
  label: string;
  hint: string;
  /** Which of the twelve keys it uses, counted up from its home note. */
  keys: readonly number[];
}

export const SCALES: readonly Scale[] = [
  { id: 'major', label: 'Major', hint: 'Bright and settled: marches, fanfares, a safe village', keys: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'Minor', hint: 'Darker and sadder: dungeons, danger, loss', keys: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'five', label: 'Five-note', hint: 'Major with its two awkward notes left out: nothing in it can clash. The easiest to make a tune with', keys: [0, 2, 4, 7, 9] },
  { id: 'five-minor', label: 'Five-note minor', hint: 'The same, dark: moody, and still nothing clashes', keys: [0, 3, 5, 7, 10] },
  { id: 'all', label: 'Every key', hint: 'All twelve keys, as on a piano', keys: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

export const scaleById = (id: string | undefined): Scale => SCALES.find(s => s.id === id) ?? SCALES[0];

/** Is `key` one of the scale's notes, when the scale's home note is `home` (0 = C ... 11 = B)? */
export function inScale(key: number, home: number, scale: Scale): boolean {
  return scale.keys.includes((((key - home) % 12) + 12) % 12);
}

/** "C4" for key 60. */
export function keyName(key: number): string {
  return `${NOTE_NAMES[((key % 12) + 12) % 12]}${Math.floor(key / 12) - 1}`;
}

/** Black keys of a piano: drawn darker, so the grid reads like one. */
export const isBlackKey = (key: number): boolean => [1, 3, 6, 8, 10].includes(((key % 12) + 12) % 12);

export interface Row {
  key: number;
  /** A note sits on this key although the scale does not have it: shown so the note can be seen and moved. */
  stray: boolean;
  /** A drum's row: its name, shown in place of the key's. */
  label?: string;
}

/**
 * The rows of the grid, highest first: the scale's keys between `low` and
 * `high`, and any other key in that range that already has a note on it.
 */
export function gridRows(low: number, high: number, home: number, scale: Scale, notes: readonly SongNote[]): Row[] {
  const used = new Set(notes.map(n => n.key));
  const rows: Row[] = [];
  for (let key = Math.min(HIGHEST_KEY, high); key >= Math.max(LOWEST_KEY, low); key--) {
    const inside = inScale(key, home, scale);
    if (inside || used.has(key)) rows.push({ key, stray: !inside });
  }
  return rows;
}

/**
 * The rows of a RUN's grid (RunEditor), highest first. A run's steps are
 * counted in keys from the layer's own Pitch, which is the scale's home:
 * the rows are the keys of the scale between `low` and `high`, and any
 * other key a step already sits on (so no step is ever out of sight).
 */
export function runRows(low: number, high: number, scale: Scale, steps: readonly number[]): number[] {
  const used = new Set(steps.map(s => Math.round(s)));
  const top = Math.max(high, ...used);
  const bottom = Math.min(low, ...used);
  const rows: number[] = [];
  for (let offset = top; offset >= bottom; offset--) {
    if (inScale(offset, 0, scale) || used.has(offset)) rows.push(offset);
  }
  return rows;
}

// ---- instruments ------------------------------------------------------------------

export interface Instrument {
  id: string;
  label: string;
  hint: string;
  /** Whether its notes are held for as long as they are drawn (see SongTrack.held). */
  held: boolean;
  make: () => SynthSound;
}

const fromLayer = (starterId: string, held: boolean, label?: string): Instrument => {
  const starter = LAYER_STARTERS.find(s => s.id === starterId)!;
  return {
    id: starterId,
    label: label ?? starter.label,
    hint: starter.hint,
    held,
    make: () => ({ version: 1, level: 1, layers: [{ id: 'a', ...starter.make() }] }),
  };
};

/**
 * Instruments to start from: the Forge's instrument layers, each as a sound
 * of one layer. None has been heard by anyone (see forgeModel.ts): they are
 * there to be picked, played and then tuned in the Sounds half of the Forge.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  fromLayer('pluck', false),
  fromLayer('lead', true),
  fromLayer('flute', true),
  fromLayer('organ', true),
  fromLayer('horn', true),
  fromLayer('strings', true),
  fromLayer('chime', false),
  fromLayer('bell', false),
  fromLayer('blip', false),
];

// ---- the drum kit -------------------------------------------------------------------
// Eight drums, each a Forge sound of a layer or two, built the way drum
// machines have always built them: a kick is a low note that drops, a snare
// a crack of noise over a short note, a hat a tick of very high noise, a
// cymbal the same let ring. None has been heard by anyone: like the
// instruments they are there to be played, and any of them can be swapped
// for a sound made in the Sounds half. Their levels were set by measuring
// them beside the instruments (the kick peaks at about twice the harp, the
// snare a little under the kick, hats and cymbals level with the harp),
// not by ear. The keys are General MIDI's.

export interface KitDrum {
  key: number;
  name: string;
  hint: string;
  make: () => SynthSound;
}

type Recipe = Omit<SynthLayer, 'id' | 'start' | 'floor'> & { start?: number; floor?: number };
const drumSound = (...layers: Recipe[]): SynthSound => ({
  version: 1,
  level: 1,
  layers: layers.map((layer, i) => ({ id: String.fromCharCode(97 + i), start: 0, floor: 0.02, ...layer })),
});
const highs = (hz: number) => [{ type: 'highpass' as const, cutoff: { from: hz, to: hz } }];

/** The kit, in the order its rows are shown: cymbals at the top, the kick at the bottom. */
export const DRUM_KIT: readonly KitDrum[] = [
  {
    key: 49, name: 'Crash', hint: 'A cymbal struck and left to ring: the start of a section',
    make: () => drumSound({ name: 'Crash', source: 'noise', length: 0.9, level: 0.16, attack: 0.001, hold: 0, floor: 0.01, tail: 0.12, noiseSeed: 0.2, filters: highs(4500) }),
  },
  {
    key: 46, name: 'Open hat', hint: 'The hi-hat left open: a short splash',
    make: () => drumSound({ name: 'Open hat', source: 'noise', length: 0.26, level: 0.14, attack: 0.001, hold: 0, tail: 0.05, noiseSeed: 0.9, filters: highs(7000) }),
  },
  {
    key: 42, name: 'Hat', hint: 'The hi-hat closed: a tick. The steady pulse of most beats',
    make: () => drumSound({ name: 'Hat', source: 'noise', length: 0.045, level: 0.16, attack: 0.001, hold: 0, tail: 0.012, noiseSeed: 0.6, filters: highs(7000) }),
  },
  {
    key: 39, name: 'Clap', hint: 'Hands clapped: three quick bursts of noise that blur into one',
    make: () => {
      const burst = (start: number, length: number, level: number): Recipe => ({
        name: 'Clap', source: 'noise', start, length, level, attack: 0.001, hold: 0, tail: Math.min(0.03, length / 3), noiseSeed: 1.2 + start * 7,
        filters: [{ type: 'bandpass', q: 1.2, cutoff: { from: 1200, to: 1200 } }],
      });
      return drumSound(burst(0, 0.012, 0.5), burst(0.013, 0.012, 0.5), burst(0.026, 0.15, 0.6));
    },
  },
  {
    key: 50, name: 'High tom', hint: 'A small drum: a note that drops and rings a little',
    make: () => drumSound({ name: 'High tom', source: 'tone', wave: 'sine', length: 0.2, level: 0.28, attack: 0.002, hold: 0, tail: 0.03, pitch: { from: 270, to: 170, arriveAt: 0.08 } }),
  },
  {
    key: 45, name: 'Low tom', hint: 'A bigger drum, lower',
    make: () => drumSound({ name: 'Low tom', source: 'tone', wave: 'sine', length: 0.26, level: 0.3, attack: 0.002, hold: 0, tail: 0.04, pitch: { from: 180, to: 100, arriveAt: 0.1 } }),
  },
  {
    key: 38, name: 'Snare', hint: 'The crack on the second and fourth beat: noise over a short note',
    make: () => drumSound(
      { name: 'Rattle', source: 'noise', length: 0.15, level: 0.2, attack: 0.001, hold: 0, tail: 0.03, noiseSeed: 1.4, filters: highs(1100) },
      { name: 'Skin', source: 'tone', wave: 'triangle', length: 0.09, level: 0.2, attack: 0.001, hold: 0, tail: 0.02, pitch: { from: 230, to: 170, arriveAt: 0.04 } },
    ),
  },
  {
    key: 36, name: 'Kick', hint: 'The bass drum: the thump on the beat',
    make: () => drumSound(
      { name: 'Thump', source: 'tone', wave: 'sine', length: 0.22, level: 0.42, attack: 0.002, hold: 0.01, tail: 0.04, pitch: { from: 170, to: 52, arriveAt: 0.08 } },
      { name: 'Beater', source: 'noise', length: 0.008, level: 0.1, attack: 0, hold: 0, tail: 0.003, noiseSeed: 0.5, filters: highs(1500) },
    ),
  },
];

/** The rows of a drum part's grid: one to a drum, in the kit's order. */
export function kitRows(track: SongTrack): Row[] {
  return (track.kit ?? []).map(drum => ({ key: drum.key, stray: false, label: drum.name }));
}

let counter = 0;
export const newTrackId = (): string => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

/** A drum part with the kit and no hits yet. */
export function drumTrack(name = 'Drums'): SongTrack {
  const kit = DRUM_KIT.map(drum => ({ key: drum.key, name: drum.name, sound: drum.make() }));
  const kick = kit[kit.length - 1];
  return { id: newTrackId(), name, instrument: kick.sound, root: kick.key, level: 1, notes: [], kit };
}

/** A track playing `sound`, with no notes yet. */
export function trackFrom(name: string, sound: SynthSound, held: boolean): SongTrack {
  return { id: newTrackId(), name, instrument: sound, root: soundRoot(sound), held, level: 1, notes: [] };
}

/** An empty song: four bars at a walking pace, a harp, C major on show. */
export function newSong(): SynthSong {
  const harp = INSTRUMENTS[0];
  return {
    version: 1,
    tempo: 110,
    length: 4 * STEPS_PER_BAR,
    level: 1,
    tracks: [trackFrom(harp.label, harp.make(), harp.held)],
    view: { home: 0, scale: 'major', low: 48, high: 84 },
  };
}

export const cloneSong = (song: SynthSong): SynthSong => JSON.parse(JSON.stringify(song)) as SynthSong;
export const sameSong = (a: SynthSong, b: SynthSong): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---- edits ------------------------------------------------------------------------

/** The note covering a cell (key, step) of a track, if any. */
export function noteAt(notes: readonly SongNote[], key: number, step: number): SongNote | undefined {
  return notes.find(n => n.key === key && step >= n.at && step < n.at + n.length);
}

/**
 * A note made to fit: whole steps, inside the song, on a real key, and not
 * running into the next note on its own key (`others`: the track's other notes).
 */
export function fitNote(note: SongNote, songLength: number, others: readonly SongNote[]): SongNote {
  const at = Math.min(Math.max(0, Math.round(note.at)), Math.max(0, songLength - 1));
  const key = Math.min(HIGHEST_KEY, Math.max(LOWEST_KEY, Math.round(note.key)));
  let length = Math.max(1, Math.round(note.length));
  length = Math.min(length, songLength - at);
  for (const other of others) if (other.key === key && other.at > at) length = Math.min(length, other.at - at);
  return { ...note, at, key, length: Math.max(1, length) };
}

/** The same note: two notes of a track cannot start on the same key at the same step. */
const sameNote = (a: SongNote, b: SongNote): boolean => a.at === b.at && a.key === b.key;

/** The track's notes with one added (fitted). */
export function addNote(notes: readonly SongNote[], note: SongNote, songLength: number): SongNote[] {
  return [...notes, fitNote(note, songLength, notes)].sort((a, b) => a.at - b.at || a.key - b.key);
}

/** The track's notes with `old` replaced by `next` (fitted against the rest). */
export function replaceNote(notes: readonly SongNote[], old: SongNote, next: SongNote, songLength: number): SongNote[] {
  const rest = notes.filter(n => !sameNote(n, old));
  // Moved onto another note of the same key: it stays where it was.
  const fitted = fitNote(next, songLength, rest);
  if (rest.some(n => n.key === fitted.key && fitted.at >= n.at && fitted.at < n.at + n.length)) return [...notes];
  return [...rest, fitted].sort((a, b) => a.at - b.at || a.key - b.key);
}

export function removeNote(notes: readonly SongNote[], old: SongNote): SongNote[] {
  return notes.filter(n => !sameNote(n, old));
}

// ---- how hard a note is struck ------------------------------------------------------
// SongNote.level: 1 is the part as it is set, lower is gentler, higher is an
// accent. It is what makes a tune breathe: a strong first beat, soft notes
// between. A level of 1 is not written into the note.

export const MIN_STRENGTH = 0.2;
export const MAX_STRENGTH = 1.5;

/** A note at a strength (to the nearest twentieth, inside the range). */
export function withStrength(note: SongNote, strength: number): SongNote {
  const level = Math.round(Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, strength)) * 20) / 20;
  const { level: _old, ...plain } = note;
  void _old;
  return level === 1 ? plain : { ...plain, level };
}

/** The track's notes with one of them set to a strength. The same list back when nothing changes. */
export function strengthenNote(notes: readonly SongNote[], old: SongNote, strength: number): readonly SongNote[] {
  const next = withStrength(old, strength);
  if ((next.level ?? 1) === (old.level ?? 1)) return notes;
  return notes.map(n => (sameNote(n, old) ? next : n));
}

/** How solid a note is drawn for its strength (0-1): gentle notes are fainter. */
export const strengthOpacity = (level: number | undefined): number => Math.min(1, Math.max(0.3, 0.2 + 0.65 * (level ?? 1)));

/** The song at a new length in bars. Notes that no longer start inside it are dropped; ones that overhang are cut. */
export function withBars(song: SynthSong, bars: number): SynthSong {
  const length = Math.min(MAX_BARS, Math.max(1, Math.round(bars))) * STEPS_PER_BAR;
  return {
    ...song,
    length,
    tracks: song.tracks.map(track => ({
      ...track,
      notes: track.notes.filter(n => n.at < length).map(n => ({ ...n, length: Math.min(n.length, length - n.at) })),
    })),
  };
}

/** How many notes a song has. */
export const noteCount = (song: SynthSong): number => song.tracks.reduce((sum, track) => sum + track.notes.length, 0);

// ---- the editing state: a working copy per opened song, each with undo --------------

export interface SongWork { name: string; song: SynthSong; past: SynthSong[]; future: SynthSong[] }

export interface SongState {
  work: Record<string, SongWork>;
  /** The last edit: a run of edits to the same thing is one undo step. */
  stamp: { id: string; tag: string; time: number } | null;
}

export type SongAction =
  | { type: 'open'; id: string; name: string; song: SynthSong }
  | { type: 'edit'; id: string; song: SynthSong; tag: string; time: number; /** One step however long it takes (a drag). */ sticky?: boolean }
  | { type: 'rename'; id: string; name: string }
  | { type: 'undo'; id: string }
  | { type: 'redo'; id: string }
  | { type: 'drop'; id: string };

const SAME_STEP_MS = 700;
const HISTORY = 100;

export function songReducer(state: SongState, action: SongAction): SongState {
  const current = state.work[action.id];
  switch (action.type) {
    case 'open':
      return current ? state : { stamp: null, work: { ...state.work, [action.id]: { name: action.name, song: cloneSong(action.song), past: [], future: [] } } };
    case 'edit': {
      if (!current) return state;
      const s = state.stamp;
      const sameStep = !!s && s.id === action.id && s.tag === action.tag && (!!action.sticky || action.time - s.time < SAME_STEP_MS);
      const past = sameStep ? current.past : [...current.past, current.song].slice(-HISTORY);
      return { work: { ...state.work, [action.id]: { ...current, song: action.song, past, future: [] } }, stamp: { id: action.id, tag: action.tag, time: action.time } };
    }
    case 'rename':
      return current ? { ...state, work: { ...state.work, [action.id]: { ...current, name: action.name } } } : state;
    case 'undo': {
      if (!current || current.past.length === 0) return state;
      const song = current.past[current.past.length - 1];
      return { stamp: null, work: { ...state.work, [action.id]: { ...current, song, past: current.past.slice(0, -1), future: [current.song, ...current.future] } } };
    }
    case 'redo': {
      if (!current || current.future.length === 0) return state;
      const [song, ...future] = current.future;
      return { stamp: null, work: { ...state.work, [action.id]: { ...current, song, past: [...current.past, current.song], future } } };
    }
    case 'drop': {
      const work = { ...state.work };
      delete work[action.id];
      return { work, stamp: null };
    }
  }
}
