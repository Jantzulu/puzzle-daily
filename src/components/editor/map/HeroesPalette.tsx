// Heroes palette: folder filter + search + checkbox list choosing which
// heroes players can use (capped at 5). Extracted verbatim from
// MapEditor.tsx (Phase 1 decomposition, 2026-07-14).
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
    <h2 className="text-lg font-bold mb-3">Available Heroes</h2>
    <p className="text-xs text-stone-400 mb-3">Select which heroes players can use</p>
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
      <div className="space-y-2 max-h-80 overflow-y-auto mt-2">
        {characters.map(char => {
          const spells = getAllSpells(char.behavior);
          const isSelected = availableCharacters.includes(char.id);
          const isAtCap = availableCharacters.length >= 5 && !isSelected;

          return (
            <ActionTooltip key={char.id} actions={char.behavior}>
              <label className={`flex items-center gap-2 p-2 bg-stone-700 rounded ${isAtCap ? 'opacity-50 cursor-not-allowed' : 'hover:bg-stone-600 cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isAtCap}
                  onChange={(e) => onToggleCharacter(char.id, e.target.checked)}
                  className="w-4 h-4"
                />
                <SpriteThumbnail sprite={char.customSprite} size={32} previewType="entity" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{char.name}</div>
                  <div className="text-xs text-stone-400">HP: {char.health}</div>
                </div>
                {spells.length > 0 && (
                  <div className="flex gap-1 flex-shrink-0">
                    {spells.map(spell => (
                      <SpellTooltip key={spell.id} spell={spell}>
                        <div className="w-6 h-6 rounded overflow-hidden cursor-help">
                          {spell.thumbnailIcon ? (
                            <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            <div className="w-full h-full bg-arcane-600 flex items-center justify-center text-xs">S</div>
                          )}
                        </div>
                      </SpellTooltip>
                    ))}
                  </div>
                )}
              </label>
            </ActionTooltip>
          );
        })}
      </div>
    )}
  </div>
);
