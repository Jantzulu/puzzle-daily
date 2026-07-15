// Enemy palette: folder filter + search + a dense card grid (sprite, name,
// HP, spell icons — details live on hover). Cards auto-fill the available
// width, so the palette gets more columns exactly when the canvas is narrow.
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5 max-h-80 overflow-y-auto mt-2">
        {enemies.map(enemy => {
          const spells = getAllSpells(enemy.behavior?.pattern);
          return (
            <ActionTooltip key={enemy.id} actions={enemy.behavior?.pattern}>
              <button
                onClick={() => onSelect(enemy.id)}
                className={`w-full h-full rounded p-1.5 flex flex-col items-center ${
                  selectedEnemyId === enemy.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
                }`}
                title={`${enemy.name} — HP ${enemy.health}`}
              >
                <SpriteThumbnail sprite={enemy.customSprite} size={40} previewType="entity" />
                <span className="text-[11px] leading-tight truncate w-full text-center mt-1">{enemy.name}</span>
                <span className="text-[10px] text-stone-400">HP {enemy.health}</span>
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
