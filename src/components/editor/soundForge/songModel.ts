// What the song editor knows that the player does not: the scales that pick
// which rows the grid shows, the instruments a new track can start from,
// what a new song is, and the small edits (add, move, stretch, remove a
// note). Plain functions: no React, no audio, so they can be tested.

import { HIGHEST_KEY, LOWEST_KEY, MAX_BARS, STEPS_PER_BAR, soundRoot, type SongNote, type SongTrack, type SynthSong } from '../../../utils/synth/song';
import type { SynthSound } from '../../../utils/synth/types';
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

let counter = 0;
export const newTrackId = (): string => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

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
