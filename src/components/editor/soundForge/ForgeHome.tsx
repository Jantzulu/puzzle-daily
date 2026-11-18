import React from 'react';
import { SongForge } from './SongForge';
import { SoundForge } from './SoundForge';

// The Sound Forge's two halves: SOUNDS (one sound, made of layers) and SONGS
// (notes on a grid, played on those sounds; user ask 2026-11-17).
//
// Both stay mounted and the one not on show is only hidden: each holds
// unsaved working copies and their undo histories, and switching halves to
// tune an instrument must not throw a half-written song away. The hidden
// half is told so (`active`), so that Ctrl+Z and Space reach only the one
// on screen.

type Half = 'sounds' | 'songs';

const HALVES: ReadonlyArray<{ id: Half; label: string; hint: string }> = [
  { id: 'sounds', label: 'Sounds', hint: 'One sound at a time, built from layers: a clank, a chime, an instrument' },
  { id: 'songs', label: 'Songs', hint: 'Notes on a grid, played on your sounds: a jingle, a tune' },
];

export const ForgeHome: React.FC = () => {
  const [half, setHalf] = React.useState<Half>('sounds');
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-stone-700 bg-stone-900/60">
        <div className="max-w-6xl mx-auto px-3 md:px-4 flex gap-1 pt-1.5" role="tablist" aria-label="Sound Forge">
          {HALVES.map(h => (
            <button
              key={h.id}
              type="button"
              role="tab"
              aria-selected={half === h.id}
              title={h.hint}
              onClick={() => setHalf(h.id)}
              className={`px-3 py-1 text-sm rounded-t border border-b-0 ${
                half === h.id ? 'bg-stone-700 border-stone-600 text-parchment-100' : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-200'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`flex-1 min-h-0 ${half === 'sounds' ? '' : 'hidden'}`}><SoundForge active={half === 'sounds'} /></div>
      <div className={`flex-1 min-h-0 ${half === 'songs' ? '' : 'hidden'}`}><SongForge active={half === 'songs'} /></div>
    </div>
  );
};
