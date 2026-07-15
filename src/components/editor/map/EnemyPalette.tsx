// Enemy palette: folder filter + search + selectable enemy list with spell
// tooltips. Extracted verbatim from MapEditor.tsx (Phase 1, 2026-07-14).
import React from 'react';
import type { EnemyWithSprite } from '../../../data/enemies';
import { FolderDropdown } from '../FolderDropdown';
import { SpriteThumbnail } from '../SpriteThumbnail';
import { getAllSpells, SpellTooltip, ActionTooltip } from './Tooltips';

interface EnemyPaletteProps {
  enemies: EnemyWithSprite[];
  totalEnemyCount: number;
  enemyFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedEnemyId: string | null;
  onSelect: (enemyId: string) => void;
}

export const EnemyPalette: React.FC<EnemyPaletteProps> = ({
  enemies,
  totalEnemyCount,
  enemyFolderId,
  onFolderSelect,
  searchTerm,
  onSearchChange,
  selectedEnemyId,
  onSelect,
}) => (
  <div className="bg-stone-800 p-4 rounded">
    <h2 className="text-lg font-bold mb-3">Select Enemy</h2>
    <FolderDropdown
      category="enemies"
      selectedFolderId={enemyFolderId}
      onFolderSelect={onFolderSelect}
    />
    <input
      type="text"
      placeholder="Search enemies..."
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
      className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
    />
    {enemies.length === 0 ? (
      <p className="text-sm text-stone-400 mt-2">
        {totalEnemyCount === 0 ? 'No enemies available. Create enemies in Asset Manager!' : searchTerm ? 'No enemies match your search.' : 'No enemies in this folder.'}
      </p>
    ) : (
      <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
        {enemies.map(enemy => {
          const spells = getAllSpells(enemy.behavior?.pattern);
          return (
            <ActionTooltip key={enemy.id} actions={enemy.behavior?.pattern}>
              <button
                onClick={() => onSelect(enemy.id)}
                className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                  selectedEnemyId === enemy.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                }`}
              >
                <SpriteThumbnail sprite={enemy.customSprite} size={32} previewType="entity" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{enemy.name}</div>
                  <div className="text-xs text-stone-400">HP: {enemy.health}</div>
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
