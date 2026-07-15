// Ally palette — first-class tool (2026-07-14). Allies place into
// puzzle.enemies via the adapter; the party: 'hero' stamp in paintTile is
// what makes them allies. Extracted verbatim from MapEditor.tsx (Phase 1).
import React from 'react';
import type { CustomEnemy } from '../../../utils/assetStorage';
import { FolderDropdown } from '../FolderDropdown';
import { SpriteThumbnail } from '../SpriteThumbnail';
import { getAllSpells, SpellTooltip, ActionTooltip } from './Tooltips';

interface AllyPaletteProps {
  allies: CustomEnemy[];
  totalAllyCount: number;
  allyFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedAllyId: string | null;
  onSelect: (allyId: string) => void;
}

export const AllyPalette: React.FC<AllyPaletteProps> = ({
  allies,
  totalAllyCount,
  allyFolderId,
  onFolderSelect,
  searchTerm,
  onSearchChange,
  selectedAllyId,
  onSelect,
}) => (
  <div className="bg-stone-800 p-4 rounded">
    <h2 className="text-lg font-bold mb-3">🛡️ Select Ally</h2>
    <FolderDropdown
      category="allies"
      selectedFolderId={allyFolderId}
      onFolderSelect={onFolderSelect}
    />
    <input
      type="text"
      placeholder="Search allies..."
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
      className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
    />
    {allies.length === 0 ? (
      <p className="text-sm text-stone-400 mt-2">
        {totalAllyCount === 0 ? (
          <>
            No allies yet. Create allies in{' '}
            <a href="/assets?tab=allies" className="text-blue-400 hover:underline">
              Asset Manager → Allies
            </a>
          </>
        ) : searchTerm ? 'No allies match your search.' : 'No allies in this folder.'}
      </p>
    ) : (
      <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
        {allies.map(ally => {
          const spells = getAllSpells(ally.behavior?.pattern);
          return (
            <ActionTooltip key={ally.id} actions={ally.behavior?.pattern}>
              <button
                onClick={() => onSelect(ally.id)}
                className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                  selectedAllyId === ally.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                }`}
              >
                <SpriteThumbnail sprite={ally.customSprite} size={32} previewType="entity" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {ally.name}
                    {ally.isNoble && <span className="ml-1 text-xs text-copper-300 font-medium">NOBLE</span>}
                  </div>
                  <div className="text-xs text-stone-400">HP: {ally.health}</div>
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
              </button>
            </ActionTooltip>
          );
        })}
      </div>
    )}
  </div>
);
