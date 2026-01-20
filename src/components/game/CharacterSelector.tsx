import React from 'react';
import { getCharacter } from '../../data/characters';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { HelpButton } from './HelpOverlay';

interface CharacterSelectorProps {
  availableCharacterIds: string[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
  placedCharacterIds?: string[];
  onClearAll?: () => void;
  onTest?: () => void;
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  availableCharacterIds,
  selectedCharacterId,
  onSelectCharacter,
  placedCharacterIds = [],
  onClearAll,
  onTest,
}) => {
  return (
    <div className="dungeon-panel p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: Help + Title + Test button */}
        <div className="flex items-center gap-2">
          <HelpButton sectionId="characters" />
          <h3 className="text-lg font-bold text-copper-400">Heroes</h3>
          {onTest && (
            <button
              onClick={onTest}
              className="px-2 py-1 text-xs bg-arcane-800 hover:bg-arcane-700 border border-arcane-600 text-arcane-100 rounded transition-colors flex items-center gap-1"
              title="Test your heroes without enemies for 5 turns"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Test
            </button>
          )}
        </div>
        {/* Right: Count + Clear button */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-400">
            {placedCharacterIds.length} placed
          </span>
          {onClearAll && placedCharacterIds.length > 0 && (
            <button
              onClick={onClearAll}
              className="p-1 text-stone-400 hover:text-blood-400 hover:bg-stone-700 rounded-pixel transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
              title="Remove all placed heroes"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {availableCharacterIds.map((charId) => {
          const character = getCharacter(charId);
          if (!character) return null;

          const isSelected = selectedCharacterId === charId;
          const isPlaced = placedCharacterIds.includes(charId);
          const hasTooltipSteps = character.tooltipSteps && character.tooltipSteps.length > 0;

          return (
            <div
              key={charId}
              onClick={() => !isPlaced && onSelectCharacter(isSelected ? null : charId)}
              className={`rounded-pixel-md p-2 transition-all cursor-pointer flex flex-col items-center border-2 min-w-[80px] ${
                isPlaced
                  ? 'bg-stone-900/80 border-dashed border-stone-600 opacity-60 cursor-not-allowed'
                  : isSelected
                  ? 'bg-copper-800/80 border-copper-500 shadow-torch'
                  : 'bg-stone-800/80 border-stone-600 hover:bg-stone-700 hover:border-copper-600'
              }`}
            >
              {/* HP display - above sprite */}
              <div className={`text-xs text-center font-medium mb-1 ${
                isSelected ? 'text-parchment-100' : 'text-copper-400'
              }`}>
                HP: {character.health}
              </div>

              {/* Sprite */}
              <div className="relative flex-shrink-0">
                <SpriteThumbnail sprite={character.customSprite} size={48} previewType="entity" />
                {isPlaced && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-pixel">
                    <span className="text-copper-400 text-lg">✓</span>
                  </div>
                )}
              </div>

              {/* Name and Title */}
              <div className="mt-1 text-center max-w-[100px]">
                <span className={`text-xs font-medium ${
                  isSelected ? 'text-parchment-100' : 'text-parchment-300'
                }`}>
                  {character.name}
                </span>
                {character.title && (
                  <span className={`text-xs italic ${
                    isSelected ? 'text-copper-200' : 'text-stone-500'
                  }`}> {character.title}</span>
                )}
              </div>

              {/* Tooltip steps - always visible */}
              {hasTooltipSteps && (
                <ul className={`mt-1 text-xs text-left max-w-[100px] list-disc list-inside ${
                  isSelected ? 'text-copper-200' : 'text-stone-400'
                }`}>
                  {character.tooltipSteps!.map((step, idx) => (
                    <li key={idx}><RichTextRenderer html={step} /></li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {selectedCharacterId && (
        <div className="mt-3 pt-3 border-t border-stone-700 text-sm text-copper-400 font-medium text-center">
          Click on the dungeon to place your hero
        </div>
      )}
    </div>
  );
};
