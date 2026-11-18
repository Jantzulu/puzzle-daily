import React from 'react';
import { STEPS_PER_BAR, STEPS_PER_BEAT, type SongNote } from '../../../utils/synth/song';
import { addNote, fitNote, isBlackKey, keyName, noteAt, removeNote, replaceNote, type Row } from './songModel';

// THE GRID a tune is written on (user ask 2026-11-17: "going down and
// manually selecting notes is not the most efficient way to do it"). Time
// runs left to right, one column to a step; keys run bottom to top, one row
// to a key, and only the keys of the chosen scale have rows.
//
//   tap an empty square     a note there, of the chosen length, and it sounds
//   tap a note              it is removed
//   drag from empty space   a note as long as the drag (mouse or pen)
//   drag a note             it moves, in time and to other keys
//   drag a note's right end it gets longer or shorter
//
// On a touch screen a drag scrolls the grid, so there it is tap only (and a
// tap counts when the finger lifts, so that scrolling leaves no notes
// behind): the length of a new note comes from the "Note length" buttons.
//
// The notes are plain boxes laid over a striped background: nothing is made
// per square, so a long song costs no more to show than a short one.

export const CELL_W = 18;
export const ROW_H = 18;
const GUTTER_W = 46;
/** A drag that begins this close to a note's right end stretches it (px). */
const EDGE = 7;

type Drag =
  | { kind: 'draw'; key: number; from: number; note: SongNote; moved: boolean }
  | { kind: 'move'; grabStep: number; original: SongNote; note: SongNote; moved: boolean }
  | { kind: 'stretch'; original: SongNote; note: SongNote; moved: boolean };

export const PianoRoll: React.FC<{
  notes: readonly SongNote[];
  rows: readonly Row[];
  /** The song's length (steps). */
  length: number;
  /** How long a tapped-in note is (steps). */
  noteLength: number;
  /** Where the song is playing now (steps), or a negative number when it is not. Read every frame. */
  playhead: () => number;
  /** `tag` names the gesture, so a whole drag is one undo step. */
  onChange: (notes: SongNote[], tag: string, sticky?: boolean) => void;
  /** Sound a key, for `steps` long (a new note, a tap on the keys at the side). */
  onSound: (key: number, steps: number) => void;
}> = ({ notes, rows, length, noteLength, playhead, onChange, onSound }) => {
  const grid = React.useRef<HTMLDivElement>(null);
  const line = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<Drag | null>(null);
  const dragId = React.useRef(0);
  /** A finger is down on this square: it becomes a tap only if it lifts without the grid having scrolled. */
  const touched = React.useRef<{ step: number; key: number } | null>(null);
  const rowOf = React.useMemo(() => new Map(rows.map((row, i) => [row.key, i])), [rows]);

  // The playhead: moved straight on the element, every frame, so playing a
  // song does not redraw the grid sixty times a second.
  React.useEffect(() => {
    let frame = 0;
    const tick = () => {
      const at = playhead();
      const el = line.current;
      if (el) {
        el.style.display = at >= 0 ? 'block' : 'none';
        if (at >= 0) el.style.transform = `translateX(${at * CELL_W}px)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playhead]);

  const cellAt = (e: React.PointerEvent): { step: number; key: number | null; x: number } => {
    const box = grid.current!.getBoundingClientRect();
    const x = e.clientX - box.left;
    const row = Math.floor((e.clientY - box.top) / ROW_H);
    return { step: Math.min(length - 1, Math.max(0, Math.floor(x / CELL_W))), key: rows[row]?.key ?? null, x };
  };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { step, key, x } = cellAt(e);
    if (key === null) return;
    dragId.current++;
    // A finger may be about to scroll: nothing happens until it lifts.
    if (e.pointerType === 'touch') { touched.current = { step, key }; return; }
    const hit = noteAt(notes, key, step);
    if (hit) {
      const nearEnd = (hit.at + hit.length) * CELL_W - x <= EDGE && hit.length * CELL_W > EDGE * 2;
      drag.current = nearEnd
        ? { kind: 'stretch', original: hit, note: hit, moved: false }
        : { kind: 'move', grabStep: step - hit.at, original: hit, note: hit, moved: false };
    } else {
      const note = fitNote({ at: step, length: noteLength, key }, length, notes);
      drag.current = { kind: 'draw', key, from: step, note, moved: false };
      onChange(addNote(notes, note, length), `draw:${dragId.current}`, true);
      onSound(key, note.length);
    }
    // (A mouse or pen keeps the pointer for the whole gesture, wherever it goes.)
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the pointer is already gone: the gesture just ends at the grid's edge */ }
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { step, key } = cellAt(e);
    const tag = `${d.kind}:${dragId.current}`;
    const others = notes.filter(n => !(n.at === d.note.at && n.key === d.note.key));
    if (d.kind === 'draw') {
      const next = fitNote({ ...d.note, length: step > d.from ? step - d.from + 1 : noteLength }, length, others);
      if (next.length === d.note.length) return;
      onChange(replaceNote(notes, d.note, next, length), tag, true);
      drag.current = { ...d, note: next, moved: true };
    } else if (d.kind === 'stretch') {
      const next = fitNote({ ...d.note, length: Math.max(1, step - d.note.at + 1) }, length, others);
      if (next.length === d.note.length) return;
      onChange(replaceNote(notes, d.note, next, length), tag, true);
      drag.current = { ...d, note: next, moved: true };
    } else {
      // (Its own length each time: squeezed against a neighbour, it grows back when moved clear.)
      const next = { ...d.note, length: d.original.length, at: Math.max(0, step - d.grabStep), key: key ?? d.note.key };
      if (next.at === d.note.at && next.key === d.note.key) return;
      const changed = replaceNote(notes, d.note, next, length);
      const landed = changed.find(n => n.key === next.key && n.at === Math.min(next.at, length - 1));
      if (!landed) return; // something is in the way: it stays where it was
      onChange(changed, tag, true);
      if (landed.key !== d.note.key) onSound(landed.key, landed.length);
      drag.current = { ...d, note: landed, moved: true };
    }
  };

  const up = () => {
    const tap = touched.current;
    touched.current = null;
    if (tap) {
      // A finger's tap: a note there, or the note there taken away.
      const hit = noteAt(notes, tap.key, tap.step);
      if (hit) onChange(removeNote(notes, hit), `remove:${dragId.current}`);
      else {
        const note = fitNote({ at: tap.step, length: noteLength, key: tap.key }, length, notes);
        onChange(addNote(notes, note, length), `draw:${dragId.current}`);
        onSound(tap.key, note.length);
      }
      return;
    }
    const d = drag.current;
    drag.current = null;
    // A tap on a note (no drag) takes it away.
    if (d && d.kind !== 'draw' && !d.moved) onChange(removeNote(notes, d.note), `remove:${dragId.current}`);
  };

  const width = length * CELL_W;
  const height = rows.length * ROW_H;
  const bar = STEPS_PER_BAR * CELL_W;
  const beat = STEPS_PER_BEAT * CELL_W;
  const bars = Math.ceil(length / STEPS_PER_BAR);

  return (
    <div className="border border-stone-700 rounded bg-stone-900 overflow-auto" style={{ maxHeight: 440 }}>
      <div className="relative" style={{ width: GUTTER_W + width, minWidth: '100%' }}>
        {/* Bar numbers. */}
        <div className="sticky top-0 z-20 flex bg-stone-800 border-b border-stone-700" style={{ height: 18 }}>
          <div className="sticky left-0 z-10 shrink-0 bg-stone-800" style={{ width: GUTTER_W }} />
          <div className="relative" style={{ width }}>
            {Array.from({ length: bars }, (_, b) => (
              <div key={b} className="absolute top-0 text-[10px] leading-[18px] text-stone-400 pl-1 border-l border-stone-600" style={{ left: b * bar, height: 18 }}>
                {b + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="flex">
          {/* The keys, down the side: tap one to hear it. */}
          <div className="sticky left-0 z-10 shrink-0 bg-stone-900 border-r border-stone-700" style={{ width: GUTTER_W }}>
            {rows.map(row => (
              <button
                key={row.key}
                type="button"
                onClick={() => onSound(row.key, noteLength)}
                title={row.stray ? `${keyName(row.key)} (not in the scale: shown because a note sits on it)` : `Hear ${keyName(row.key)}`}
                className={`block w-full text-right pr-1.5 text-[10px] tabular-nums border-b border-stone-800 hover:bg-stone-700 ${
                  row.stray ? 'text-copper-400 italic' : row.key % 12 === 0 ? 'text-parchment-100' : 'text-stone-400'
                } ${isBlackKey(row.key) ? 'bg-stone-950' : 'bg-stone-800/60'}`}
                style={{ height: ROW_H, lineHeight: `${ROW_H - 1}px` }}
              >
                {keyName(row.key)}
              </button>
            ))}
          </div>

          {/* The grid. */}
          <div
            ref={grid}
            role="application"
            aria-label="The notes of the song. Tap a square to place a note; tap a note to remove it."
            className="relative select-none cursor-crosshair"
            style={{
              width,
              height,
              touchAction: 'pan-x pan-y',
              // Lines: every step faint, every beat clearer, every bar clearest.
              backgroundImage: [
                `repeating-linear-gradient(to right, rgba(214,188,150,0.38) 0 1px, transparent 1px ${bar}px)`,
                `repeating-linear-gradient(to right, rgba(214,188,150,0.16) 0 1px, transparent 1px ${beat}px)`,
                `repeating-linear-gradient(to right, rgba(214,188,150,0.06) 0 1px, transparent 1px ${CELL_W}px)`,
              ].join(','),
            }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { drag.current = null; touched.current = null; }}
          >
            {rows.map((row, i) => (
              <div
                key={row.key}
                aria-hidden="true"
                className={`absolute left-0 right-0 border-b ${row.key % 12 === 0 ? 'border-stone-600' : 'border-stone-800'} ${
                  isBlackKey(row.key) ? 'bg-black/30' : ''
                } ${row.stray ? 'bg-copper-900/20' : ''}`}
                style={{ top: i * ROW_H, height: ROW_H }}
              />
            ))}
            {notes.map(note => {
              const row = rowOf.get(note.key);
              if (row === undefined) return null;
              return (
                <div
                  key={`${note.key}:${note.at}`}
                  aria-label={`${keyName(note.key)}, bar ${Math.floor(note.at / STEPS_PER_BAR) + 1}`}
                  className="absolute rounded-sm bg-arcane-400 border border-arcane-200 pointer-events-none"
                  style={{ left: note.at * CELL_W + 1, top: row * ROW_H + 2, width: Math.max(4, note.length * CELL_W - 2), height: ROW_H - 4 }}
                >
                  {/* The end that stretches. */}
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-arcane-100/70 rounded-r-sm" />
                </div>
              );
            })}
            <div ref={line} aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-0.5 bg-moss-300 pointer-events-none" style={{ display: 'none' }} />
          </div>
        </div>
      </div>
    </div>
  );
};
