import React from 'react';
import { NOTE_NAMES, nearestNote, noteHz } from './forgeModel';

// Picking a pitch the way a note is picked: a small keyboard for which note,
// a stepper for which octave (user ask 2026-11-15: "a slider for notes feels
// like not the best way to pick pitches"). The exact number stays editable
// beside it, for pitches that are not on a key (a thud at 92 Hz).

const KEY_W = 26;
const KEY_H = 54;
/** White keys by note index, and each black key with the white key it follows. */
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = [{ note: 1, after: 0 }, { note: 3, after: 1 }, { note: 6, after: 3 }, { note: 8, after: 4 }, { note: 10, after: 5 }];
const LOWEST_OCTAVE = 0;
const HIGHEST_OCTAVE = 8;

export const NotePicker: React.FC<{
  label: string;
  /** The pitch (Hz). */
  value: number;
  onChange: (hz: number) => void;
}> = ({ label, value, onChange }) => {
  const near = nearestNote(value);
  const octave = Math.min(HIGHEST_OCTAVE, Math.max(LOWEST_OCTAVE, near.octave));
  const onKey = near.cents === 0;

  // While the box is being typed in it holds its own text.
  const [typing, setTyping] = React.useState<string | null>(null);
  const shown = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  const commit = (text: string) => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n) && n > 0) onChange(Math.min(12000, Math.max(20, n)));
    setTyping(null);
  };

  const pianoKey = (note: number, black: boolean) => {
    const chosen = near.index === note;
    const look = black
      ? chosen ? 'bg-arcane-500 border-arcane-300' : 'bg-stone-900 border-stone-600 hover:bg-stone-700'
      : chosen ? 'bg-arcane-400 border-arcane-300 text-stone-900' : 'bg-parchment-100 border-stone-500 text-stone-700 hover:bg-parchment-300';
    return (
      <button
        key={note}
        type="button"
        onClick={() => onChange(noteHz(note, octave))}
        aria-label={`${NOTE_NAMES[note]}${octave}`}
        aria-pressed={chosen}
        title={`${NOTE_NAMES[note]}${octave}`}
        className={`absolute top-0 border rounded-b-sm flex items-end justify-center pb-0.5 text-[9px] leading-none ${look}`}
        style={black
          ? { left: (BLACK.find(b => b.note === note)!.after + 1) * KEY_W - KEY_W * 0.32, width: KEY_W * 0.64, height: KEY_H * 0.6, zIndex: 1 }
          : { left: WHITE.indexOf(note) * KEY_W, width: KEY_W, height: KEY_H }}
      >
        {black ? '' : NOTE_NAMES[note]}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="w-16 shrink-0 text-xs text-parchment-300">{label}</div>
      <div className="relative shrink-0" style={{ width: WHITE.length * KEY_W, height: KEY_H }}>
        {WHITE.map(n => pianoKey(n, false))}
        {BLACK.map(b => pianoKey(b.note, true))}
      </div>
      <div className="flex items-center gap-1 text-xs text-stone-400">
        <span>Octave</span>
        <button
          type="button" onClick={() => onChange(value / 2)} disabled={octave <= LOWEST_OCTAVE}
          className="w-7 h-7 rounded border border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700 disabled:opacity-40" aria-label="An octave lower" title="An octave lower"
        >
          −
        </button>
        <span className="w-4 text-center text-parchment-100 tabular-nums">{octave}</span>
        <button
          type="button" onClick={() => onChange(value * 2)} disabled={octave >= HIGHEST_OCTAVE}
          className="w-7 h-7 rounded border border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700 disabled:opacity-40" aria-label="An octave higher" title="An octave higher"
        >
          +
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
        <input
          type="text"
          inputMode="decimal"
          value={typing ?? shown}
          aria-label={`${label}, exact pitch in Hz`}
          onFocus={e => { setTyping(shown); e.target.select(); }}
          onChange={e => setTyping(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-16 bg-stone-900 border border-stone-700 rounded px-1.5 py-0.5 text-xs text-parchment-100 text-right tabular-nums"
        />
        <span>Hz</span>
        <span className="text-arcane-300">
          {NOTE_NAMES[near.index]}{near.octave}
          {!onKey && <span className="text-stone-500"> {near.cents > 0 ? '+' : '−'}{Math.abs(near.cents)} off</span>}
        </span>
      </div>
    </div>
  );
};
