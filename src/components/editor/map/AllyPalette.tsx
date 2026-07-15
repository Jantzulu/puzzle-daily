// Ally palette — dense card grid, same presentation as the enemy palette.
// Allies place into puzzle.enemies via the adapter; the party: 'hero' stamp
// in paintTile is what makes them allies.
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5 max-h-80 overflow-y-auto mt-2">
        {allies.map(ally => {
          const spells = getAllSpells(ally.behavior?.pattern);
          return (
            <ActionTooltip key={ally.id} actions={ally.behavior?.pattern}>
              <button
                onClick={() => onSelect(ally.id)}
                className={`relative w-full h-full rounded p-1.5 flex flex-col items-center ${
                  selectedAllyId === ally.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                }`}
                title={`${ally.name}${ally.isNoble ? ' (Noble)' : ''} — HP ${ally.health}`}
              >
                {ally.isNoble && (
                  <span className="absolute top-0.5 right-0.5 text-[9px] px-1 rounded-full bg-copper-600/40 text-copper-200 border border-copper-500/40">N</span>
                )}
                <SpriteThumbnail sprite={ally.customSprite} size={40} previewType="entity" />
                <span className="text-[11px] leading-tight truncate w-full text-center mt-1">{ally.name}</span>
                <span className="text-[10px] text-stone-400">HP {ally.health}</span>
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
