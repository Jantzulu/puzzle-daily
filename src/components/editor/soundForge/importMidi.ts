// "A MIDI file..." in the Songs half of the Forge: a song written anywhere
// else (or one of the thousands of old tunes that exist as MIDI) comes in as
// parts and notes on the grid, to be played on the Forge's own instruments
// and then changed at will. utils/synth/midi.ts reads the file; this turns
// what it read into a song.
//
// WHAT IS KEPT: every part's notes, on the grid's sixteenths; the first
// tempo; an instrument of the same family as the one the file asked for;
// the drums, on the Forge's kit of eight (MIDI has some sixty drums and
// rattles: each is played on the nearest of the eight, see drumFor).
// WHAT IS NOT, and the summary says so each time it matters: tempo changes
// after the first, anything finer than a sixteenth (triplets are pulled
// onto the grid), more than eight parts, more than MAX_BARS.

import { MAX_BARS, STEPS_PER_BAR, STEPS_PER_BEAT, type SongNote, type SynthSong } from '../../../utils/synth/song';
import { readMidi, type MidiFile, type MidiPart } from '../../../utils/synth/midi';
import { INSTRUMENTS, SCALES, drumTrack, inScale, trackFrom, type Instrument } from './songModel';

export const MAX_MIDI_BYTES = 2 * 1024 * 1024;
const MAX_PARTS = 8;
const DRUM_CHANNEL = 9;

const instrument = (id: string): Instrument => INSTRUMENTS.find(i => i.id === id) ?? INSTRUMENTS[0];

/**
 * The Forge instrument nearest a General MIDI instrument number. General
 * MIDI groups its 128 instruments in families of eight (pianos, organs,
 * guitars, strings...), and a family is as close as nine instruments can get.
 */
export function instrumentFor(program: number): Instrument {
  const family = Math.floor(Math.max(0, Math.min(127, program)) / 8);
  switch (family) {
    case 0: return instrument('pluck'); // pianos: struck strings
    case 1: return instrument('chime'); // celesta, glockenspiel, music box, vibraphone
    case 2: return instrument('organ');
    case 3: return instrument('pluck'); // guitars
    case 4: return instrument('pluck'); // basses
    case 5: return instrument('strings'); // violin, viola, cello (bowed)
    case 6: return instrument('strings'); // ensembles and choirs
    case 7: return instrument('horn'); // brass
    case 8: return instrument('lead'); // reeds: sax, oboe, clarinet
    case 9: return instrument('flute'); // pipes
    case 10: return instrument('lead'); // synth leads
    case 11: return instrument('strings'); // synth pads
    case 14: return instrument('bell'); // tinkle bell, steel drums and the like
    default: return instrument('pluck');
  }
}

/**
 * The drum of the Forge's kit (by its key) that stands in for a General
 * MIDI drum key, or null for one with nothing like it in the kit (whistles,
 * a triangle, wood blocks: better left out than played as a wrong drum).
 */
export function drumFor(key: number): number | null {
  if (key === 35 || key === 36) return 36; // bass drums
  if (key === 37 || key === 38 || key === 40) return 38; // side stick, snares
  if (key === 39) return 39; // hand clap
  if (key === 41 || key === 43 || key === 45 || key === 47) return 45; // floor and low toms
  if (key === 48 || key === 50) return 50; // high toms
  if (key === 42 || key === 44) return 42; // closed and pedal hi-hat
  if (key === 46) return 46; // open hi-hat
  if (key === 49 || key === 52 || key === 55 || key === 57) return 49; // crash, china, splash
  if (key === 51 || key === 53 || key === 59) return 42; // ride cymbals: a steady tick
  if (key === 54 || key === 69 || key === 70 || key === 82) return 42; // tambourine, cabasa, maracas, shaker
  if (key === 60 || key === 62 || key === 65) return 50; // high bongo, conga, timbale
  if (key === 61 || key === 63 || key === 64 || key === 66) return 45; // low bongo, congas, timbale
  return null;
}

export interface ImportedSong {
  song: SynthSong;
  /** One line for the person: what was made of the file, and what was left out. */
  summary: string;
}

export function songFromMidi(midi: MidiFile): ImportedSong {
  const perStep = midi.ticksPerBeat / STEPS_PER_BEAT;
  const toStep = (tick: number) => Math.round(tick / perStep);
  // Every drum hit of the file, whichever of its tracks it is on: one drum part.
  const hits = midi.parts.filter(p => p.channel === DRUM_CHANNEL).flatMap(p => p.notes).filter(n => drumFor(n.key) !== null);
  const pitched = midi.parts.filter(p => p.channel !== DRUM_CHANNEL && p.notes.length > 0);
  if (pitched.length === 0 && hits.length === 0) throw new Error('no notes');
  // The busiest eight (seven beside a drum part), kept in the file's order.
  const room = MAX_PARTS - (hits.length > 0 ? 1 : 0);
  const kept = [...pitched].sort((a, b) => b.notes.length - a.notes.length).slice(0, room);
  const parts = pitched.filter(p => kept.includes(p));

  // It starts where its first note does: the silence before it is left behind.
  const firstTick = Math.min(...parts.map(p => Math.min(...p.notes.map(n => n.tick))), ...hits.map(n => n.tick));
  const lead = Math.floor(toStep(firstTick) / STEPS_PER_BAR) * STEPS_PER_BAR;
  const maxSteps = MAX_BARS * STEPS_PER_BAR;
  let cut = 0;
  let pulled = 0;
  let counted = 0;
  let lastEnd = 0;
  const tracks = parts.map((part: MidiPart, i) => {
    const voice = instrumentFor(part.program);
    const taken = new Set<string>();
    const notes: SongNote[] = [];
    for (const note of part.notes) {
      const exact = note.tick / perStep;
      const at = toStep(note.tick) - lead;
      if (at >= maxSteps) { cut++; continue; }
      const length = Math.max(1, Math.min(maxSteps - at, Math.round(note.ticks / perStep)));
      counted++;
      if (Math.abs(exact - Math.round(exact)) > 0.2) pulled++;
      const id = `${at}:${note.key}`;
      if (taken.has(id)) continue; // two notes that land on one square: one is enough
      taken.add(id);
      // (How hard it was struck, against a firm 96 of 127; gentle notes stay gentle.)
      const level = Math.round(Math.max(0.3, Math.min(1.3, note.velocity / 96)) * 20) / 20;
      notes.push({ at, length, key: note.key, ...(level !== 1 ? { level } : {}) });
      lastEnd = Math.max(lastEnd, at + length);
    }
    notes.sort((a, b) => a.at - b.at || a.key - b.key);
    // A note must stop where the next on its own key begins.
    const nextOnKey = new Map<number, number>();
    for (let n = notes.length - 1; n >= 0; n--) {
      const next = nextOnKey.get(notes[n].key);
      if (next !== undefined) notes[n] = { ...notes[n], length: Math.max(1, Math.min(notes[n].length, next - notes[n].at)) };
      nextOnKey.set(notes[n].key, notes[n].at);
    }
    const made = trackFrom(part.name || `${voice.label} ${i + 1}`, voice.make(), voice.held);
    return { ...made, notes };
  }).filter(track => track.notes.length > 0);

  // The scale the notes keep to, if they keep to one: its rows are the grid.
  // (Before the drums are added: a drum's key is not a pitch.)
  const keys = tracks.flatMap(track => track.notes.map(n => n.key));

  if (hits.length > 0) {
    const taken = new Set<string>();
    const notes: SongNote[] = [];
    for (const hit of hits) {
      const at = toStep(hit.tick) - lead;
      if (at >= maxSteps) { cut++; continue; }
      const key = drumFor(hit.key)!;
      const id = `${at}:${key}`;
      if (taken.has(id)) continue;
      taken.add(id);
      const level = Math.round(Math.max(0.3, Math.min(1.3, hit.velocity / 96)) * 20) / 20;
      notes.push({ at, length: 1, key, ...(level !== 1 ? { level } : {}) });
      lastEnd = Math.max(lastEnd, at + 1);
    }
    notes.sort((a, b) => a.at - b.at || a.key - b.key);
    if (notes.length > 0) tracks.push({ ...drumTrack(), notes });
  }
  if (tracks.length === 0) throw new Error('no notes');
  let view = { home: 0, scale: 'all', low: 48, high: 84 };
  let bestFit = 0;
  for (const scale of SCALES.filter(s => s.id === 'major' || s.id === 'minor')) {
    for (let home = 0; home < 12; home++) {
      const fit = keys.filter(k => inScale(k, home, scale)).length / keys.length;
      // (Every major scale is also a minor one three keys down: the first found is kept.)
      if (keys.length > 0 && fit > bestFit + 1e-9) { bestFit = fit; if (fit >= 0.97) view = { ...view, home, scale: scale.id }; }
    }
  }
  if (keys.length > 0) {
    view.low = Math.max(12, Math.floor(Math.min(...keys) / 12) * 12);
    view.high = Math.min(108, Math.ceil((Math.max(...keys) + 1) / 12) * 12);
  }

  const bars = Math.min(MAX_BARS, Math.max(1, Math.ceil(lastEnd / STEPS_PER_BAR)));
  const song: SynthSong = {
    version: 1,
    tempo: Math.round(Math.max(40, Math.min(240, midi.tempo))),
    length: bars * STEPS_PER_BAR,
    // Several parts at once are louder than one: turned down so they do not crowd the game's other sounds.
    level: Math.round((1 / Math.sqrt(tracks.length)) * 100) / 100,
    tracks,
    view,
  };

  const total = tracks.reduce((sum, track) => sum + track.notes.length, 0);
  let summary = `${tracks.length} part${tracks.length === 1 ? '' : 's'}, ${total} notes, ${bars} bar${bars === 1 ? '' : 's'} at ${song.tempo} beats a minute.`;
  if (hits.length > 0) summary += " Its drums are played on the Forge's kit.";
  if (pitched.length > parts.length) summary += ` Only the ${room} busiest parts were kept, of ${pitched.length}.`;
  if (cut > 0) summary += ` It was cut at ${MAX_BARS} bars.`;
  if (midi.tempoChanges > 0) summary += ' Its changes of speed were not followed.';
  if (counted > 0 && pulled > counted * 0.1) summary += ' Many of its notes fall between the squares (triplets or a loose performance) and were moved to the nearest.';
  return { song, summary };
}

/** Read a MIDI file and make the song. Throws when it is not one, or holds no notes that can be played. */
export async function songFromMidiFile(file: Blob): Promise<ImportedSong> {
  return songFromMidi(readMidi(new Uint8Array(await file.arrayBuffer())));
}
