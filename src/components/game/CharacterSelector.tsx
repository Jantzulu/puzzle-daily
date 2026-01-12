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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Available Characters</h3>
        <span className="text-sm text-gray-400">
          {placedCharacterIds.length} / {availableCharacterIds.length} placed
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
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
              title={hasTooltipSteps ? character.tooltipSteps!.join('\n') : character.name}
            >
              {/* Sprite */}
              <div className="relative flex-shrink-0">
                <SpriteThumbnail sprite={character.customSprite} size={48} />
                {isPlaced && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                    <span className="text-green-400 text-lg">✓</span>
                  </div>
                )}
              </div>

              {/* Name */}
              <span className="text-xs font-medium text-gray-200 mt-1 text-center max-w-[60px] truncate">
                {character.name}
              </span>
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
