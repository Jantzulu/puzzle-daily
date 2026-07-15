// Heroes palette — dense card grid choosing which heroes players can use
// (capped at 5). Clicking a card toggles it; a ✓ badge marks selected.
import React from 'react';
import type { CharacterWithSprite } from '../../../data/characters';
import { FolderDropdown } from '../FolderDropdown';
import { SpriteThumbnail } from '../SpriteThumbnail';
import { getAllSpells, SpellTooltip, ActionTooltip } from './Tooltips';

interface HeroesPaletteProps {
  characters: CharacterWithSprite[];
  totalCharacterCount: number;
  characterFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  availableCharacters: string[];
  onToggleCharacter: (characterId: string, checked: boolean) => void;
}

export const HeroesPalette: React.FC<HeroesPaletteProps> = ({
  characters,
  totalCharacterCount,
  characterFolderId,
  onFolderSelect,
  searchTerm,
  onSearchChange,
  availableCharacters,
  onToggleCharacter,
}) => (
  <div className="bg-stone-800 p-4 rounded">
    <h2 className="text-lg font-bold mb-1">Available Heroes</h2>
    <p className="text-xs text-stone-400 mb-3">Click to toggle which heroes players can use (max 5)</p>
    <FolderDropdown
      category="characters"
      selectedFolderId={characterFolderId}
      onFolderSelect={onFolderSelect}
    />
    <input
      type="text"
      placeholder="Search heroes..."
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
      className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
    />
    {characters.length === 0 ? (
      <p className="text-sm text-stone-400 mt-2">
        {totalCharacterCount === 0 ? 'No characters available' : searchTerm ? 'No heroes match your search.' : 'No characters in this folder.'}
      </p>
    ) : (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5 max-h-96 overflow-y-auto mt-2">
        {characters.map(char => {
          const spells = getAllSpells(char.behavior);
          const isSelected = availableCharacters.includes(char.id);
          const isAtCap = availableCharacters.length >= 5 && !isSelected;

          return (
            <ActionTooltip key={char.id} actions={char.behavior}>
              <button
                onClick={() => onToggleCharacter(char.id, !isSelected)}
                disabled={isAtCap}
                className={`relative w-full h-full rounded p-1.5 flex flex-col items-center ${
                  isSelected
                    ? 'bg-blue-600'
                    : isAtCap
                      ? 'bg-stone-700 opacity-50 cursor-not-allowed'
                      : 'bg-stone-700 hover:bg-stone-600'
                }`}
                title={`${char.name} — HP ${char.health}${isAtCap ? ' (hero cap reached)' : ''}`}
              >
                {isSelected && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-moss-600 text-[10px] flex items-center justify-center">✓</span>
                )}
                <SpriteThumbnail sprite={char.customSprite} size={40} previewType="entity" />
                <span className="text-[11px] leading-tight truncate w-full text-center mt-1">{char.name}</span>
                <span className="text-[10px] text-stone-400">HP {char.health}</span>
                {spells.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {spells.slice(0, 3).map(spell => (
                      <SpellTooltip key={spell.id} spell={spell}>
                        <div className="w-4 h-4 rounded overflow-hidden cursor-help">
                          {spell.thumbnailIcon ? (
                            <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            <div className="w-full h-full bg-arcane-600 flex items-center justify-center text-[9px]">S</div>
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
    )}
  </div>
);
