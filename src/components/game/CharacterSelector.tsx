import React from 'react';
import { getCharacter } from '../../data/characters';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { SpellTooltip, getAllSpells } from '../shared/Tooltips';

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

      <div className="space-y-3">
        {availableCharacterIds.map((charId) => {
          const character = getCharacter(charId);
          if (!character) return null;

          const spells = getAllSpells(character.behavior);
          const isSelected = selectedCharacterId === charId;
          const isPlaced = placedCharacterIds.includes(charId);
          const hasTooltipSteps = character.tooltipSteps && character.tooltipSteps.length > 0;

          return (
            <div
              key={charId}
              onClick={() => !isPlaced && onSelectCharacter(isSelected ? null : charId)}
              className={`rounded p-3 transition-all cursor-pointer ${
                isPlaced
                  ? 'bg-gray-900 border border-dashed border-gray-600 opacity-60 cursor-not-allowed'
                  : isSelected
                  ? 'bg-green-600 ring-2 ring-green-400'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Sprite */}
                <div className="relative flex-shrink-0">
                  <SpriteThumbnail sprite={character.customSprite} size={48} />
                  {isPlaced && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                      <span className="text-green-400 text-lg">✓</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-200">{character.name}</span>
                    {isPlaced && <span className="text-xs text-gray-400">(Placed)</span>}
                  </div>

                  {/* Spell icons */}
                  {spells.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {spells.map(spell => (
                        <SpellTooltip key={spell.id} spell={spell}>
                          <div className="w-5 h-5 rounded overflow-hidden cursor-help">
                            {spell.thumbnailIcon ? (
                              <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-purple-600 flex items-center justify-center text-xs">
                                {spell.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        </SpellTooltip>
                      ))}
                    </div>
                  )}

                  {/* Custom tooltip steps */}
                  {hasTooltipSteps && (
                    <div className="mt-2 text-xs text-gray-300 space-y-0.5">
                      {character.tooltipSteps!.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-1">
                          <span className="text-gray-500">•</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
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
