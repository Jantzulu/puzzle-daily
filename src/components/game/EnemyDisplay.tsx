import React from 'react';
import type { PlacedEnemy } from '../../types/game';
import { getEnemy } from '../../data/enemies';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { HelpButton } from './HelpOverlay';
import type { ThemeAssets } from '../../utils/themeAssets';

interface EnemyDisplayProps {
  enemies: PlacedEnemy[];
  onTest?: () => void;
  showTestButton?: boolean;
  themeAssets?: ThemeAssets;
  className?: string;
}

export const EnemyDisplay: React.FC<EnemyDisplayProps> = ({ enemies, onTest, showTestButton = false, themeAssets = {}, className = '' }) => {
  // Determine button shape class
  const getShapeClass = (shape?: string) => {
    switch (shape) {
      case 'rounded': return 'rounded-lg';
      case 'pill': return 'rounded-full';
      default: return 'rounded';
    }
  };
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
      <div className={`dungeon-panel p-2 lg:p-3 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <HelpButton sectionId="enemies" />
          <h3 className="text-lg lg:text-xl font-bold text-blood-400">Enemies</h3>
        </div>
        <p className="text-sm lg:text-base text-stone-500 text-center">No enemies remaining</p>
      </div>
    );
  }

  return (
    <div className={`dungeon-panel p-2 lg:p-3 ${className}`}>
      {/* Header row */}
      <div className="relative flex items-center justify-between mb-3">
        {/* Left: Help + Title */}
        <div className="flex items-center gap-2">
          <HelpButton sectionId="enemies" />
          <h3 className="text-lg lg:text-xl font-bold text-blood-400">Enemies</h3>
        </div>
        {/* Center: Test button (absolutely positioned for true centering) */}
        {showTestButton && onTest && (
          themeAssets.actionButtonTestEnemiesImage ? (
            // Custom image button
            <button
              onClick={onTest}
              className="absolute left-1/2 -translate-x-1/2 transition-all hover:scale-105 active:scale-95"
              title="Watch enemies move without heroes for 5 turns"
            >
              <img
                src={themeAssets.actionButtonTestEnemiesImage}
                alt="Test Enemies"
                className="h-6 lg:h-8 w-auto"
                style={{ imageRendering: 'pixelated' }}
              />
            </button>
          ) : (
            // Default styled button
            <button
              onClick={onTest}
              className={`absolute left-1/2 -translate-x-1/2 px-2 lg:px-3 py-1 lg:py-1.5 text-xs lg:text-sm transition-colors flex items-center gap-1 ${
                themeAssets.actionButtonTestEnemiesBg ? '' : 'bg-blood-800 hover:bg-blood-700 border border-blood-600 text-blood-100'
              } ${getShapeClass(themeAssets.actionButtonTestEnemiesShape)}`}
              style={{
                ...(themeAssets.actionButtonTestEnemiesBg && { backgroundColor: themeAssets.actionButtonTestEnemiesBg }),
                ...(themeAssets.actionButtonTestEnemiesBorder && { borderColor: themeAssets.actionButtonTestEnemiesBorder, borderWidth: '1px', borderStyle: 'solid' }),
                ...(themeAssets.actionButtonTestEnemiesText && { color: themeAssets.actionButtonTestEnemiesText }),
              }}
              title="Watch enemies move without heroes for 5 turns"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 lg:h-4 lg:w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Test
            </button>
          )
        )}
        {/* Right: Count indicator */}
        <span className="text-sm lg:text-base text-stone-400">
          {livingEnemies.length} remaining
        </span>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {uniqueEnemies.map(({ enemy, count }) => {
          const enemyData = getEnemy(enemy.enemyId);
          if (!enemyData) return null;

          const hasTooltipSteps = enemyData.tooltipSteps && enemyData.tooltipSteps.length > 0;

          return (
            <div
              key={enemy.enemyId}
              className="p-2 bg-stone-800/80 rounded-pixel-md border border-blood-900/50 flex flex-col items-center"
            >
              {/* HP display - above sprite */}
              <div className="text-xs lg:text-sm text-center text-blood-400 font-medium mb-1">
                HP: {enemyData.health}
              </div>

              {/* Sprite */}
              <div className="relative flex-shrink-0">
                <SpriteThumbnail sprite={enemyData.customSprite} size={48} previewType="entity" />
                {count > 1 && (
                  <span className="absolute -top-1 -right-1 text-xs bg-blood-900 text-blood-300 px-1 py-0.5 rounded-pixel min-w-[18px] text-center border border-blood-700">
                    {count}
                  </span>
                )}
              </div>
              {/* Name and Title */}
              <div className="mt-1 text-center max-w-[100px] lg:max-w-[120px]">
                <span className="text-xs lg:text-sm font-medium text-blood-300">
                  {enemyData.name}
                </span>
                {enemyData.title && (
                  <span className="text-xs lg:text-sm text-stone-500 italic"> {enemyData.title}</span>
                )}
              </div>

              {/* Tooltip steps - always visible */}
              {hasTooltipSteps && (
                <ul className="mt-1 text-xs lg:text-sm text-stone-400 text-left max-w-[100px] lg:max-w-[120px] list-disc list-inside">
                  {enemyData.tooltipSteps!.map((step, idx) => (
                    <li key={idx}><RichTextRenderer html={step} /></li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
