// A SONG: notes on a timeline, played on instruments that are Forge sounds.
//
// User ask 2026-11-17, once sounds could be made by hand: "the next step
// seems to be some kind of music maker ... Right now we can work with small
// soundbytes, but not longer songs."
//
// The synth can already play any sound at any pitch (render.ts, `pitch`), so
// an INSTRUMENT is simply a sound, and a song is a list of notes for each
// instrument. Like a sound, a song is a recipe and not audio: a few
// kilobytes however long it plays, in keeping with the rule that sound must
// never cost storage the sprites need.
//
//   time    counted in STEPS: a quarter of a beat (a sixteenth note). The
//           song's tempo says how long a beat is.
//   pitch   counted in KEYS, as on a piano: 60 is middle C, 69 the A above
//           it (440 Hz), 12 keys to the octave (the numbers MIDI uses, so a
//           MIDI file can be read straight in).
//
// This file is the format and the arithmetic: what plays when, and what
// sound each note is. It touches no clock and nothing random, so the same
// song is the same every time. songPlayer.ts keeps a song playing live;
// render.ts turns each note into audio. Keep it free of browser code: it is
// imported by types/game.ts.

import { renderSynthSound } from './render';
import { layersLength, soundLength, type SynthLayer, type SynthSound } from './types';

/** Steps in a beat (a step is a sixteenth note). */
export const STEPS_PER_BEAT = 4;
/** Beats in a bar. Every song is in four-four for now. */
export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;

export const MIN_TEMPO = 40;
export const MAX_TEMPO = 240;
/** The longest song (bars): about four minutes at a walking pace. */
export const MAX_BARS = 128;
export const LOWEST_KEY = 12; // C0
export const HIGHEST_KEY = 108; // C8

export interface SongNote {
  /** When it starts (steps from the start of the song). */
  at: number;
  /** How long it is drawn (steps). */
  length: number;
  /** Which key (60 = middle C). */
  key: number;
  /** How hard it is played next to the track's other notes (1 = as the track is set). */
  level?: number;
}

/** One drum of a kit: the key that plays it, what it is called, and its sound. */
export interface SongDrum {
  key: number;
  name: string;
  sound: SynthSound;
  /** The name of the sound standing in for the kit's own, when one is. */
  from?: string;
}

export interface SongTrack {
  id: string;
  name: string;
  /** The instrument: any sound from the Forge. Each note plays it higher or lower. */
  instrument: SynthSound;
  /** The key the instrument's own recipe sounds at: a note on this key plays it unchanged. */
  root: number;
  /**
   * HELD: a note sounds for as long as it is drawn (an organ, a flute, a
   * lead). Not held: every note rings out its own length however it is
   * drawn (a harp, a bell, a drum).
   */
  held?: boolean;
  /**
   * A DRUM KIT (user go-ahead 2026-11-17). A part with a kit is not one
   * instrument played higher and lower: each KEY is a different drum, played
   * as it is. A note's key picks the drum; a note on a key the kit does not
   * have plays nothing. The keys are the ones MIDI gives drums (36 the kick,
   * 38 the snare, 42 the closed hat...), so a MIDI drum part reads straight
   * in. `instrument`, `root` and `held` are not used by such a part.
   */
  kit?: SongDrum[];
  level: number;
  muted?: boolean;
  notes: SongNote[];
}

export interface SynthSong {
  version: 1;
  /** Beats a minute. */
  tempo: number;
  /** How long the song is (steps). It repeats from the start when it is looped. */
  length: number;
  /** Overall loudness. */
  level: number;
  tracks: SongTrack[];
  /**
   * How the editor last showed it: the scale whose keys are on the grid
   * (its home note, 0 = C ... 11 = B, and which scale) and the range of
   * keys. Playing a song takes no notice of this.
   */
  view?: { home: number; scale: string; low: number; high: number };
}

/** How long one step lasts (s). */
export function stepSeconds(song: Pick<SynthSong, 'tempo'>): number {
  const tempo = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, song.tempo || 120));
  return 60 / tempo / STEPS_PER_BEAT;
}

/** How long one pass of the song lasts (s), not counting what rings on after its end. */
export function songSeconds(song: SynthSong): number {
  return Math.max(0, song.length) * stepSeconds(song);
}

/** The pitch of a key (Hz): 69 is 440. */
export function keyHz(key: number): number {
  return 440 * Math.pow(2, (key - 69) / 12);
}

/** The key nearest a pitch. */
export function hzKey(hz: number): number {
  return Math.round(69 + 12 * Math.log2(Math.max(1, hz) / 440));
}

/**
 * The key a sound is written at: the pitch of its loudest tone (where it
 * starts, for one that bends). A sound with no tone in it (a drum of noise)
 * counts as middle C, so that keys still play it higher and lower.
 */
export function soundRoot(sound: SynthSound): number {
  let best: SynthLayer | null = null;
  for (const layer of sound.layers) {
    if (layer.source !== 'tone' || layer.muted || !layer.pitch) continue;
    if (!best || layer.level > best.level) best = layer;
  }
  return best?.pitch ? Math.min(HIGHEST_KEY, Math.max(LOWEST_KEY, hzKey(best.pitch.from))) : 60;
}

/**
 * The sound of one note: the track's instrument at the track's and the
 * note's loudness and, on a held track, made to last as long as the note is
 * drawn. (Its pitch is not changed here: the note is played with `pitch`,
 * see noteEvents.)
 *
 * HOLDING a sound for a length: each layer keeps how it starts (its swell,
 * how long it stays full) and how it ends (its tail, which rings on past
 * the end of the note as a release); what changes is how long it lasts
 * between the two. A layer that fades while it sounds still fades, over the
 * longer or shorter stretch: a held piano note dies away, a held organ note
 * does not.
 */
export function noteSound(track: SongTrack, note: SongNote, seconds: number, songLevel = 1): SynthSound {
  const instrument = track.kit?.find(d => d.key === note.key)?.sound ?? track.instrument;
  const level = instrument.level * track.level * songLevel * (note.level ?? 1);
  if (!track.held || track.kit) return { ...instrument, level };
  return {
    ...instrument,
    level,
    layers: instrument.layers.map(layer => {
      const body = Math.max(0.02, seconds - layer.start);
      const attack = Math.min(layer.attack, body * 0.8);
      return {
        ...layer,
        length: body + layer.tail,
        attack,
        hold: Math.max(0, Math.min(layer.hold, body - attack)),
      };
    }),
  };
}

/** What to multiply the track's sound's pitch by to play a key: a drum is played as it is. */
export function notePitch(track: SongTrack, key: number): number {
  return track.kit ? 1 : Math.pow(2, (key - track.root) / 12);
}

export interface NoteEvent {
  /** When it starts (s from the start of the song). */
  time: number;
  /** How long it is drawn (s). */
  seconds: number;
  track: number;
  note: SongNote;
  /** What to multiply the instrument's pitch by to play this key. */
  pitch: number;
}

/**
 * Every note of one pass of the song, in the order they start. Notes that
 * begin outside the song (before its start, at or after its end) are not
 * played; a muted track plays nothing.
 */
export function noteEvents(song: SynthSong): NoteEvent[] {
  const step = stepSeconds(song);
  const events: NoteEvent[] = [];
  song.tracks.forEach((track, t) => {
    if (track.muted || !(track.level > 0)) return;
    for (const note of track.notes) {
      if (!(note.length > 0) || note.at < 0 || note.at >= song.length) continue;
      if (track.kit && !track.kit.some(d => d.key === note.key)) continue; // no such drum
      events.push({
        time: note.at * step,
        seconds: note.length * step,
        track: t,
        note,
        pitch: notePitch(track, note.key),
      });
    }
  });
  return events.sort((a, b) => a.time - b.time || a.track - b.track || a.note.key - b.note.key);
}

/**
 * Draw the notes that START in [from, to) seconds of the song into an audio
 * context, the song's own time `from` falling at the context's time `at`.
 * With no window, the whole song. Returns how many notes were drawn.
 */
export function scheduleSong(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  song: SynthSong,
  window: { from: number; to: number } = { from: 0, to: Infinity },
  events: NoteEvent[] = noteEvents(song),
): number {
  let drawn = 0;
  for (const event of events) {
    if (event.time < window.from) continue;
    if (event.time >= window.to) break;
    const track = song.tracks[event.track];
    renderSynthSound(ctx, out, at + (event.time - window.from), noteSound(track, event.note, event.seconds, song.level), { pitch: event.pitch });
    drawn++;
  }
  return drawn;
}

/** How long the last notes ring on after the song's end, at most (s): the longest instrument, with its tail. */
export function ringOut(song: SynthSong): number {
  let longest = 0;
  for (const track of song.tracks) {
    if (track.muted) continue;
    if (track.kit) longest = Math.max(longest, ...track.kit.map(d => layersLength(d.sound)));
    else longest = Math.max(longest, track.held ? Math.max(0, ...track.instrument.layers.map(l => l.tail)) : layersLength(track.instrument));
  }
  return Math.min(4, longest);
}

/**
 * One sound as a song: a single note of it, in a song as long as the sound
 * (echoes included). This is what lets a Forge SOUND sit in a music slot: a
 * fanfare as the victory music plays once, a drone as the background goes
 * round end to end.
 */
export function songOfSound(sound: SynthSound): SynthSong {
  const tempo = 120;
  const root = soundRoot(sound);
  const length = Math.max(1, Math.ceil(soundLength(sound) / stepSeconds({ tempo }) - 1e-6));
  return {
    version: 1,
    tempo,
    length,
    level: 1,
    tracks: [{ id: 'sound', name: 'Sound', instrument: sound, root, level: 1, notes: [{ at: 0, length, key: root }] }],
  };
}

/** A song as it must be to play: numbers in range, notes inside it, nothing missing. */
export function isSong(value: unknown): value is SynthSong {
  const v = value as SynthSong | null;
  return !!v && typeof v === 'object' && typeof v.tempo === 'number' && typeof v.length === 'number' && Array.isArray(v.tracks)
    && v.tracks.every(t => t && typeof t.id === 'string' && Array.isArray(t.notes) && !!t.instrument && Array.isArray(t.instrument.layers)
      && (t.kit === undefined || (Array.isArray(t.kit) && t.kit.every(d => d && typeof d.key === 'number' && !!d.sound && Array.isArray(d.sound.layers))))
      && t.notes.every(n => n && typeof n.at === 'number' && typeof n.length === 'number' && typeof n.key === 'number'));
}
