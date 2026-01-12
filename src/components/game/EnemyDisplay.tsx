import React from 'react';
import type { PlacedEnemy } from '../../types/game';
import { getEnemy } from '../../data/enemies';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';

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

      <div className="flex flex-wrap gap-2">
        {uniqueEnemies.map(({ enemy, count }) => {
          const enemyData = getEnemy(enemy.enemyId);
          if (!enemyData) return null;

          const hasTooltipSteps = enemyData.tooltipSteps && enemyData.tooltipSteps.length > 0;

          return (
            <div
              key={enemy.enemyId}
              className="p-2 bg-gray-700 rounded flex flex-col items-center"
              title={hasTooltipSteps ? enemyData.tooltipSteps!.join('\n') : enemyData.name}
            >
              <div className="relative">
                <SpriteThumbnail sprite={enemyData.customSprite} size={40} />
                {count > 1 && (
                  <span className="absolute -top-1 -right-1 text-xs bg-red-900 text-red-300 px-1 py-0.5 rounded min-w-[18px] text-center">
                    {count}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-red-400 mt-1 text-center max-w-[50px] truncate">
                {enemyData.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
