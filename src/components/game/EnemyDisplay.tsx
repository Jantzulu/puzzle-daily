import React from 'react';
import type { PlacedEnemy } from '../../types/game';
import { getEnemy } from '../../data/enemies';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { SpellTooltip, getAllSpells } from '../shared/Tooltips';

interface EnemyDisplayProps {
  enemies: PlacedEnemy[];
}

export const EnemyDisplay: React.FC<EnemyDisplayProps> = ({ enemies }) => {
  // Filter to only show living enemies and get unique enemy types
  const livingEnemies = enemies.filter(e => !e.dead);

  // Group enemies by type and count them
  const enemyGroups = new Map<string, { enemy: PlacedEnemy; count: number; totalHealth: number }>();

  for (const enemy of livingEnemies) {
    const existing = enemyGroups.get(enemy.enemyId);
    if (existing) {
      existing.count++;
      existing.totalHealth += enemy.currentHealth;
    } else {
      enemyGroups.set(enemy.enemyId, { enemy, count: 1, totalHealth: enemy.currentHealth });
    }
  }

  const uniqueEnemies = Array.from(enemyGroups.values());

  if (uniqueEnemies.length === 0) {
    return (
      <div className="bg-gray-800 p-4 rounded">
        <h3 className="text-lg font-bold mb-2">Enemies</h3>
        <p className="text-sm text-gray-400">No enemies remaining</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 p-4 rounded">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Enemies</h3>
        <span className="text-sm text-gray-400">
          {livingEnemies.length} remaining
        </span>
      </div>

      <div className="space-y-3">
        {uniqueEnemies.map(({ enemy, count }) => {
          const enemyData = getEnemy(enemy.enemyId);
          if (!enemyData) return null;

          const behavior = enemyData.behavior?.pattern || [];
          const spells = getAllSpells(behavior);
          const hasTooltipSteps = enemyData.tooltipSteps && enemyData.tooltipSteps.length > 0;

          return (
            <div key={enemy.enemyId} className="p-3 bg-gray-700 rounded">
              <div className="flex items-start gap-3">
                <SpriteThumbnail sprite={enemyData.customSprite} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-red-400 truncate">
                      {enemyData.name}
                    </span>
                    {count > 1 && (
                      <span className="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">
                        x{count}
                      </span>
                    )}
                  </div>

                  {/* Spell icons */}
                  {spells.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {spells.map(spell => (
                        <SpellTooltip key={spell.id} spell={spell}>
                          <div className="w-5 h-5 rounded overflow-hidden cursor-help">
                            {spell.thumbnailIcon ? (
                              <img src={spell.thumbnailIcon} alt={spell.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-red-600 flex items-center justify-center text-xs">
                                {spell.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                        </SpellTooltip>
                      ))}
                    </div>
                  )}

                  {/* Custom tooltip steps */}
                  {hasTooltipSteps && (
                    <div className="mt-2 text-xs text-gray-300 space-y-0.5">
                      {enemyData.tooltipSteps!.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-1">
                          <span className="text-gray-500">•</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
