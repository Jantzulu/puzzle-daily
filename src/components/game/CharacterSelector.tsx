import React from 'react';
import { getCharacter } from '../../data/characters';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { ActionTooltip, SpellTooltip, getAllSpells } from '../shared/Tooltips';

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

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(availableCharacterIds.length, 5)}, 1fr)` }}
      >
        {availableCharacterIds.map((charId) => {
          const character = getCharacter(charId);
          if (!character) return null;

          const spells = getAllSpells(character.behavior);
          const isSelected = selectedCharacterId === charId;
          const isPlaced = placedCharacterIds.includes(charId);

          return (
            <ActionTooltip key={charId} actions={character.behavior}>
              <button
                onClick={() => !isPlaced && onSelectCharacter(isSelected ? null : charId)}
                disabled={isPlaced}
                className={`rounded flex flex-col items-center justify-center p-2 transition-all ${
                  isPlaced
                    ? 'bg-gray-800 border border-dashed border-gray-600 opacity-50 cursor-not-allowed'
                    : isSelected
                    ? 'bg-green-600 ring-2 ring-green-400'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="relative">
                  <SpriteThumbnail sprite={character.customSprite} size={48} />
                  {isPlaced && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                      <span className="text-green-400 text-lg">✓</span>
                    </div>
                  )}
                </div>

                <span className="text-sm font-medium text-gray-200 truncate w-full text-center mt-1">
                  {character.name.length > 8 ? character.name.slice(0, 8) + '...' : character.name}
                </span>

                {/* Spell icons */}
                {spells.length > 0 && (
                  <div className="mt-1 flex gap-1 justify-center">
                    {spells.map(spell => (
                      <SpellTooltip key={spell.id} spell={spell}>
                        <div className="w-6 h-6 rounded overflow-hidden cursor-help">
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
              </button>
            </ActionTooltip>
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
