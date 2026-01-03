import React from 'react';
import { getCharacter } from '../../data/characters';

interface CharacterSelectorProps {
  availableCharacterIds: string[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  availableCharacterIds,
  selectedCharacterId,
  onSelectCharacter,
}) => {
  return (
    <div className="p-4 bg-gray-800 rounded space-y-4">
      <h3 className="text-lg font-bold">Available Characters</h3>

      <div className="space-y-2">
        {availableCharacterIds.map((charId) => {
          const character = getCharacter(charId);
          if (!character) return null;

          return (
            <button
              key={charId}
              onClick={() =>
                onSelectCharacter(selectedCharacterId === charId ? null : charId)
              }
              className={`w-full p-3 rounded text-left transition ${
                selectedCharacterId === charId
                  ? 'bg-green-600 ring-2 ring-green-400'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <div className="font-semibold">{character.name}</div>
              <div className="text-sm text-gray-300 mt-1">{character.description}</div>
              <div className="text-xs text-gray-400 mt-1">
                HP: {character.health} | DMG: {character.attackDamage}
              </div>
            </button>
          );
        })}
      </div>

      {selectedCharacterId && (
        <div className="pt-4 border-t border-gray-700 text-sm text-gray-400">
          Click on the grid to place your character
        </div>
      )}
    </div>
  );
};
