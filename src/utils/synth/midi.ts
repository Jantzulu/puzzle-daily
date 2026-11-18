// READING A MIDI FILE (user, 2026-11-17: "Midi file importing is also a
// great idea!"). A standard MIDI file is a list of "this key went down" and
// "this key came up", with the time between them, for up to sixteen
// instruments. It holds no sound, which makes it the natural thing to read
// a song from: the notes come in, and the Forge's own instruments play them.
//
// This file only READS the notes out, as the file has them (times in the
// file's own ticks). Turning them into a song the Forge can play, on its
// grid and its instruments, is soundForge/importMidi.ts.
//
// What is read: note on and off, which instrument each channel was set to
// (program change), the first tempo, each track's name. What is skipped:
// everything else (pedals, pitch bend, lyrics, later tempo changes are only
// counted). Files timed in film frames instead of beats are refused.

export interface MidiNote {
  /** When it starts, and how long it lasts (ticks). */
  tick: number;
  ticks: number;
  /** The piano key (60 = middle C). */
  key: number;
  /** How hard it was struck (1-127). */
  velocity: number;
}

export interface MidiPart {
  /** The track's name, if it has one. */
  name: string;
  /** 0-15. Channel 9 is, by long custom, the drum kit. */
  channel: number;
  /** The General MIDI instrument number the channel was set to (0-127; 0, a piano, if never set). */
  program: number;
  notes: MidiNote[];
}

export interface MidiFile {
  /** How many ticks make one beat. */
  ticksPerBeat: number;
  /** Beats a minute: the file's first tempo, or 120 if it names none. */
  tempo: number;
  /** How many times the tempo changes after that (not followed). */
  tempoChanges: number;
  /** One for each track-and-channel that plays any notes, in file order. */
  parts: MidiPart[];
}

/** Thrown for a file that is not a MIDI file, is damaged, or is timed in a way that cannot be read. */
export class MidiError extends Error {}

export function readMidi(bytes: Uint8Array): MidiFile {
  let at = 0;
  const need = (count: number) => { if (at + count > bytes.length) throw new MidiError('The file ends too soon.'); };
  const u8 = () => { need(1); return bytes[at++]; };
  const u16 = () => { need(2); const v = (bytes[at] << 8) | bytes[at + 1]; at += 2; return v; };
  const u32 = () => { need(4); const v = bytes[at] * 16777216 + ((bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]); at += 4; return v; };
  const tag = () => { need(4); const s = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]); at += 4; return s; };
  /** A number spread over as many bytes as it needs, seven bits to a byte. */
  const varLen = () => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = u8();
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new MidiError('A time in the file is not written properly.');
  };

  if (tag() !== 'MThd') throw new MidiError('This is not a MIDI file.');
  const headerLength = u32();
  const headerEnd = at + headerLength;
  u16(); // format: 0 = one track, 1 = several played together (read the same way)
  const trackCount = u16();
  const division = u16();
  if (division & 0x8000) throw new MidiError('This MIDI file is timed in film frames, which cannot be read. Save it timed in beats.');
  if (division === 0) throw new MidiError('The file does not say how long a beat is.');
  at = headerEnd;

  let tempo: number | null = null;
  let tempoChanges = 0;
  const parts: MidiPart[] = [];

  for (let t = 0; t < trackCount && at < bytes.length; t++) {
    const kind = tag();
    const length = u32();
    const end = Math.min(bytes.length, at + length);
    if (kind !== 'MTrk') { at = end; t--; continue; } // some other chunk: step over it
    let tick = 0;
    let status = 0;
    let name = '';
    const program = new Array<number>(16).fill(0);
    /** The notes of each channel, and for each key the notes still held down. */
    const byChannel = new Map<number, MidiPart>();
    const down = new Map<number, MidiNote[]>();
    const partFor = (channel: number): MidiPart => {
      let part = byChannel.get(channel);
      if (!part) { part = { name: '', channel, program: program[channel], notes: [] }; byChannel.set(channel, part); }
      return part;
    };
    const lift = (channel: number, key: number) => {
      const held = down.get(channel * 128 + key);
      const note = held?.shift();
      if (note) note.ticks = Math.max(1, tick - note.tick);
    };

    while (at < end) {
      tick += varLen();
      let first = u8();
      if (first === 0xff) {
        // Something about the music, not a note: tempo, name, the end.
        const type = u8();
        const size = varLen();
        need(size);
        if (type === 0x51 && size === 3) {
          const microseconds = (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
          if (microseconds > 0) {
            if (tempo === null) tempo = 60000000 / microseconds;
            else tempoChanges++;
          }
        } else if (type === 0x03 && !name) {
          name = Array.from(bytes.subarray(at, at + size), b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '')).join('').trim();
        }
        at += size;
        if (type === 0x2f) break; // end of track
        continue;
      }
      if (first === 0xf0 || first === 0xf7) { const size = varLen(); need(size); at += size; continue; } // a maker's own message
      // A note or a control. If the top bit is not set, this is DATA and the
      // kind of message is the same as the last one ("running status").
      if (first & 0x80) { status = first; first = u8(); }
      else if (!status) throw new MidiError('The file is damaged: a message has no kind.');
      const what = status & 0xf0;
      const channel = status & 0x0f;
      if (what === 0x90 || what === 0x80) {
        const key = first & 0x7f;
        const velocity = u8() & 0x7f;
        if (what === 0x90 && velocity > 0) {
          lift(channel, key); // the same key struck again: the first note ends here
          const note: MidiNote = { tick, ticks: 0, key, velocity };
          partFor(channel).notes.push(note);
          const held = down.get(channel * 128 + key) ?? [];
          held.push(note);
          down.set(channel * 128 + key, held);
        } else {
          lift(channel, key);
        }
      } else if (what === 0xc0) {
        program[channel] = first & 0x7f;
        // (An instrument chosen before the channel's first note is the part's instrument.)
        const part = byChannel.get(channel);
        if (part && part.notes.length === 0) part.program = program[channel];
      } else if (what === 0xd0) {
        // one byte of data, already read
      } else if (what === 0xa0 || what === 0xb0 || what === 0xe0) {
        u8();
      } else {
        throw new MidiError('The file is damaged: a message of an unknown kind.');
      }
    }
    // Keys never lifted: held to the end of the track.
    for (const held of down.values()) for (const note of held) if (note.ticks === 0) note.ticks = Math.max(1, tick - note.tick);
    at = end;
    for (const part of [...byChannel.values()].sort((a, b) => a.channel - b.channel)) {
      if (part.notes.length === 0) continue;
      part.name = name;
      parts.push(part);
    }
  }

  return { ticksPerBeat: division, tempo: tempo ?? 120, tempoChanges, parts };
}
