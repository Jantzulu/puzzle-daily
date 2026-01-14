import React from 'react';
import { getCharacter } from '../../data/characters';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';

interface CharacterSelectorProps {
  availableCharacterIds: string[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
  placedCharacterIds?: string[];
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  availableCharacterIds,
  selectedCharacterId,
  onSelectCharacter,
  placedCharacterIds = [],
}) => {
  return (
    <div className="bg-gray-800 p-4 rounded">
      <div className="flex items-center justify-center gap-2 mb-3">
        <h3 className="text-lg font-bold">Available Characters</h3>
        <span className="text-sm text-gray-400">
          ({placedCharacterIds.length} Placed)
        </span>
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
              className={`rounded p-2 transition-all cursor-pointer flex flex-col items-center ${
                isPlaced
                  ? 'bg-gray-900 border border-dashed border-gray-600 opacity-60 cursor-not-allowed'
                  : isSelected
                  ? 'bg-green-600 ring-2 ring-green-400'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {/* HP display - above sprite */}
              <div className={`text-xs text-center font-medium mb-1 ${
                isSelected ? 'text-white' : 'text-green-400'
              }`}>
                HP: {character.health}
              </div>

              {/* Sprite */}
              <div className="relative flex-shrink-0">
                <SpriteThumbnail sprite={character.customSprite} size={48} />
                {isPlaced && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                    <span className="text-green-400 text-lg">✓</span>
                  </div>
                )}
              </div>

              {/* Name and Title */}
              <div className="mt-1 text-center max-w-[100px]">
                <span className={`text-xs font-medium ${
                  isSelected ? 'text-white' : 'text-gray-200'
                }`}>
                  {character.name}
                </span>
                {character.title && (
                  <span className={`text-xs italic ${
                    isSelected ? 'text-green-100' : 'text-gray-400'
                  }`}> {character.title}</span>
                )}
              </div>

              {/* Tooltip steps - always visible */}
              {hasTooltipSteps && (
                <ul className={`mt-1 text-xs text-left max-w-[100px] list-disc list-inside ${
                  isSelected ? 'text-green-100' : 'text-gray-400'
                }`}>
                  {character.tooltipSteps!.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {selectedCharacterId && (
        <div className="mt-3 pt-3 border-t border-gray-700 text-sm text-green-400 font-medium text-center">
          Click on the grid to place your character
        </div>
      )}
    </div>
  );
};
