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
  // Showcase authoring (2026-07-21): on showcase puzzles the demo's heroes
  // are placed by the author — pick a roster hero here, then click the
  // board. Absent on normal puzzles.
  showcaseMode?: boolean;
  placingHeroId?: string | null;
  onPickPlacingHero?: (id: string | null) => void;
  placedHeroIds?: string[];
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
  showcaseMode = false,
  placingHeroId = null,
  onPickPlacingHero,
  placedHeroIds = [],
}) => (
  <div className="bg-stone-800 p-4 rounded">
    <h2 className="text-lg font-bold mb-1">Available Heroes</h2>
    <p className="text-xs text-stone-400 mb-3">Click to toggle which heroes players can use (max 5)</p>
    {showcaseMode && (
      <div className="mb-3 p-2 bg-stone-700/60 rounded border border-copper-700/40">
        <p className="text-xs font-semibold text-copper-300 mb-1">Showcase — place demo heroes</p>
        {availableCharacters.length === 0 ? (
          <p className="text-xs text-stone-400">Add heroes to the roster below first.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {availableCharacters.map(id => {
              const char = characters.find(c => c.id === id);
              const isPicked = placingHeroId === id;
              const isPlaced = placedHeroIds.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => onPickPlacingHero?.(isPicked ? null : id)}
                  className={`px-1.5 py-0.5 text-xs rounded border ${
                    isPicked
                      ? 'bg-copper-700 border-copper-500 text-parchment-200'
                      : 'bg-stone-700 border-stone-600 hover:bg-stone-600'
                  }`}
                  title={isPlaced ? 'On the board — click the board to move, or click its tile to remove' : 'Pick, then click a board tile to place'}
                >
                  {isPlaced ? '✓ ' : ''}{char?.name ?? id}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-stone-500 mt-1">
          Pick a hero, then click the board. Clicking a placed hero's tile removes it.
        </p>
      </div>
    )}
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
