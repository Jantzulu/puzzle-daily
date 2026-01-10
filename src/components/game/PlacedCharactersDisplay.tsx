import React from 'react';
import type { PlacedCharacter } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { ActionTooltip, SpellTooltip, getAllSpells } from '../shared/Tooltips';

interface PlacedCharactersDisplayProps {
  placedCharacters: PlacedCharacter[];
  maxCharacters: number;
}

export const PlacedCharactersDisplay: React.FC<PlacedCharactersDisplayProps> = ({
  placedCharacters,
  maxCharacters,
}) => {
  return (
    <div className="bg-gray-800 p-4 rounded">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Placed Characters</h3>
        <span className="text-sm text-gray-400">
          {placedCharacters.length} / {maxCharacters}
        </span>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(maxCharacters, 5)}, 1fr)` }}
      >
        {Array.from({ length: maxCharacters }).map((_, index) => {
          const placed = placedCharacters[index];
          const character = placed ? getCharacter(placed.characterId) : null;
          const spells = character ? getAllSpells(character.behavior) : [];
          const isDead = placed?.dead;
          const healthPercent = character && placed
            ? (placed.currentHealth / character.health) * 100
            : 0;

          return (
            <div key={index} className="flex flex-col items-center">
              {character && placed ? (
                <ActionTooltip actions={character.behavior}>
                  <div
                    className={`rounded flex flex-col items-center justify-center p-2 transition-all ${
                      isDead
                        ? 'bg-red-900/50 opacity-60'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <div className="relative">
                      <SpriteThumbnail sprite={character.customSprite} size={48} />
                      {isDead && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl">💀</span>
                        </div>
                      )}
                    </div>

                    <span className="text-sm font-medium text-gray-200 truncate w-full text-center mt-1">
                      {character.name.length > 8 ? character.name.slice(0, 8) + '...' : character.name}
                    </span>

                    {/* Health bar */}
                    <div className="w-full h-1.5 bg-gray-600 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          healthPercent > 50 ? 'bg-green-500' :
                          healthPercent > 25 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${healthPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 mt-0.5">
                      {placed.currentHealth} / {character.health}
                    </span>

                    {/* Spell icons */}
                    {spells.length > 0 && (
                      <div className="mt-1 flex gap-1 justify-center">
                        {spells.map(spell => (
                          <SpellTooltip key={spell.id} spell={spell}>
                            <div className="w-5 h-5 rounded overflow-hidden cursor-help">
                              {spell.thumbnailIcon ? (
                                <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-purple-600 flex items-center justify-center text-[10px] font-bold">
                                  {spell.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </SpellTooltip>
                        ))}
                      </div>
                    )}
                  </div>
                </ActionTooltip>
              ) : (
                <div className="rounded flex flex-col items-center justify-center p-2 bg-gray-800 border border-dashed border-gray-600 w-full min-h-[100px]">
                  <div className="w-12 h-12 rounded bg-gray-700 flex items-center justify-center">
                    <span className="text-gray-500 text-2xl">+</span>
                  </div>
                  <span className="text-gray-500 text-xs mt-1">Empty</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
