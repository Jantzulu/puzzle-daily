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
  </div>
);
