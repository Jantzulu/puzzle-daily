// Details tab: the puzzle's identity and presentation — name, description,
// tags, visual skin, background music, and the training-arena flag. Split
// out of PuzzleInfoPanel (Phase 2 layout rework, 2026-07-14); the field
// markup is unchanged from Phase 1.
import React from 'react';
import { toast } from '../../shared/Toast';
import type { Puzzle, PuzzleSkin, SoundAsset } from '../../../types/game';
import { TagInput } from '../../shared/TagInput';
import { suggestTags } from '../../../utils/puzzleTagSuggestions';
import type { EditorState } from './editorState';
import { getEnemy } from '../../../data/enemies';
import { getCharacter } from '../../../data/characters';

interface DetailsPanelProps {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  availableSkins: PuzzleSkin[];
  availableSounds: SoundAsset[];
  onRefreshSkins: () => void;
  onRefreshSounds: () => void;
  knownTags: string[];
  getCurrentPuzzle: () => Puzzle;
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  state,
  setState,
  availableSkins,
  availableSounds,
  onRefreshSkins,
  onRefreshSounds,
  knownTags,
  getCurrentPuzzle,
}) => (
  <div className="bg-stone-800 p-4 rounded space-y-3">
    <div>
      <label className="block text-sm mb-1">Name</label>
      <input
        type="text"
        value={state.puzzleName}
        onChange={(e) => setState(prev => ({ ...prev, puzzleName: e.target.value }))}
        className="w-full px-3 py-2 bg-stone-700 rounded"
      />
    </div>
    <div>
      <label className="block text-sm mb-1">Description</label>
      <textarea
        value={state.description}
        onChange={(e) => setState(prev => ({ ...prev, description: e.target.value }))}
        placeholder="Short description for the library..."
        rows={2}
        className="w-full px-3 py-2 bg-stone-700 rounded text-sm resize-none"
      />
    </div>
    <div>
      <label className="block text-sm mb-1">Quest Description</label>
      <textarea
        value={state.questDescription ?? ''}
        onChange={(e) => setState(prev => ({ ...prev, questDescription: e.target.value || undefined }))}
        placeholder="Optional: a sentence or two shown to the player in the quest (?) help panel..."
        rows={3}
        className="w-full px-3 py-2 bg-stone-700 rounded text-sm resize-none"
      />
      <p className="text-xs text-stone-400 mt-1">Appears as "About this Puzzle" above the generic quest help. Blank = generic help only.</p>
    </div>
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm">Tags</label>
        <button
          type="button"
          onClick={() => {
            const puzzle = getCurrentPuzzle();
            const suggested = suggestTags(puzzle);
            const newTags = suggested.filter(t => !state.tags.includes(t));
            if (newTags.length === 0) {
              toast.info('No new tags to suggest');
            } else {
              setState(prev => ({ ...prev, tags: [...prev.tags, ...newTags] }));
              toast.success(`Added ${newTags.length} suggested tag${newTags.length > 1 ? 's' : ''}`);
            }
          }}
          className="text-xs text-copper-400 hover:text-copper-300"
        >
          ✨ Auto-suggest
        </button>
      </div>
      <TagInput
        tags={state.tags}
        onChange={(tags) => setState(prev => ({ ...prev, tags }))}
        knownTags={knownTags}
        placeholder="Add tag..."
      />
    </div>

    <div>
      <label className="block text-sm mb-1">Visual Skin</label>
      <select
        value={state.skinId || 'builtin_dungeon'}
        onChange={(e) => {
          setState(prev => ({ ...prev, skinId: e.target.value }));
          onRefreshSkins(); // Refresh in case new skins were added
        }}
        className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
      >
        {availableSkins.map((skin) => (
          <option key={skin.id} value={skin.id}>
            {skin.name} {skin.isBuiltIn ? '(Built-in)' : ''}
          </option>
        ))}
      </select>
    </div>
    <div>
      <label className="block text-sm mb-1">Background Music</label>
      <select
        value={state.backgroundMusicId || ''}
        onChange={(e) => {
          setState(prev => ({ ...prev, backgroundMusicId: e.target.value || undefined }));
          onRefreshSounds(); // Refresh in case new sounds were added
        }}
        className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
      >
        <option value="">Use Global Config</option>
        {availableSounds.map((sound) => (
          <option key={sound.id} value={sound.id}>
            {sound.name}
          </option>
        ))}
      </select>
    </div>

    {/* Training Arena toggle */}
    <label className="flex items-center gap-2 mt-2 cursor-pointer">
      <input
        type="checkbox"
        checked={state.isTraining}
        onChange={(e) => setState(prev => ({ ...prev, isTraining: e.target.checked }))}
        className="w-4 h-4 accent-copper-500"
      />
      <span className="text-sm">Training Arena</span>
    </label>
    <p className="text-xs text-stone-400 mt-0.5">Show in Training Grounds page</p>

    {/* Slab showcase / information level (2026-07-21) */}
    <label className="flex items-center gap-2 mt-2 cursor-pointer">
      <input
        type="checkbox"
        checked={state.isShowcase}
        onChange={(e) => setState(prev => ({ ...prev, isShowcase: e.target.checked }))}
        className="w-4 h-4 accent-copper-500"
      />
      <span className="text-sm">Slab Showcase (information level)</span>
    </label>
    <p className="text-xs text-stone-400 mt-0.5">
      A looping demo embedded on Slab entity pages — viewers can only start it,
      never place. Place demo heroes with the Heroes tool.
    </p>
    {state.isShowcase && (
      <div className="mt-2 p-2 bg-stone-700/50 rounded space-y-2">
        <div>
          <label className="block text-xs text-stone-400 mb-1">Attached to (shows on these Slab pages)</label>
          {(() => {
            const candidates: Array<{ id: string; name: string }> = [];
            const seen = new Set<string>();
            for (const e of state.enemies) {
              if (seen.has(e.enemyId)) continue;
              seen.add(e.enemyId);
              candidates.push({ id: e.enemyId, name: getEnemy(e.enemyId)?.name ?? e.enemyId });
            }
            for (const id of state.availableCharacters) {
              if (seen.has(id)) continue;
              seen.add(id);
              candidates.push({ id, name: getCharacter(id)?.name ?? id });
            }
            if (candidates.length === 0) {
              return <p className="text-xs text-stone-500">Place entities / pick heroes first.</p>;
            }
            return (
              <div className="flex flex-wrap gap-1">
                {candidates.map(c => {
                  const on = state.showcaseEntityIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setState(prev => ({
                        ...prev,
                        showcaseEntityIds: on
                          ? prev.showcaseEntityIds.filter(id => id !== c.id)
                          : [...prev.showcaseEntityIds, c.id],
                      }))}
                      className={`px-1.5 py-0.5 text-xs rounded border ${
                        on ? 'bg-copper-700 border-copper-500 text-parchment-200' : 'bg-stone-700 border-stone-600 hover:bg-stone-600'
                      }`}
                    >
                      {on ? '✓ ' : ''}{c.name}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-stone-400">Demo length (turns per loop)</span>
          <input
            type="number" min={1} placeholder="10"
            value={state.showcaseLoopTurns ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Math.max(1, parseInt(e.target.value) || 1);
              setState(prev => ({ ...prev, showcaseLoopTurns: v }));
            }}
            className="w-16 px-1.5 py-0.5 bg-stone-700 rounded tabular-nums"
          />
        </label>
        <p className="text-[10px] text-stone-500">
          {state.showcaseHeroes.length} demo hero{state.showcaseHeroes.length === 1 ? '' : 'es'} placed.
          The demo runs with no victory or defeat and loops.
        </p>
      </div>
    )}
  </div>
);
