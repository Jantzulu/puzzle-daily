import React from 'react';
import type { PlacedEnemy, EnemyBehavior } from '../../types/game';
import { getEnemy } from '../../data/enemies';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { HelpButton } from './HelpOverlay';
import { DirectionArrow } from './DirectionArrow';
import type { ThemeAssets } from '../../utils/themeAssets';

const MOVEMENT_TYPES = new Set([
  'move_forward', 'move_backward', 'move_left', 'move_right',
  'move_diagonal_ne', 'move_diagonal_nw', 'move_diagonal_se', 'move_diagonal_sw',
]);

function getEnemyMovementInfo(behavior?: EnemyBehavior) {
  if (!behavior?.pattern) return null;
  const moveAction = behavior.pattern.find(a => MOVEMENT_TYPES.has(a.type));
  return moveAction ? { tilesPerMove: moveAction.tilesPerMove || 1 } : null;
}

interface EnemyDisplayProps {
  enemies: PlacedEnemy[];
  onTest?: () => void;
  showTestButton?: boolean;
  themeAssets?: ThemeAssets;
  className?: string;
  noPanel?: boolean; // If true, renders without the dungeon-panel wrapper
}

export const EnemyDisplay: React.FC<EnemyDisplayProps> = ({ enemies, onTest, showTestButton = false, themeAssets = {}, className = '', noPanel = false }) => {
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

  // More prominent divider for noPanel mode - separates interactive Heroes from informational sections
  const divider = noPanel ? (
    <div className="mt-2 mb-1.5">
      {/* Divider line with "Dungeon [icon] Details" integrated */}
      <div className="relative flex items-center justify-center">
        {/* Left line segment */}
        <div className="flex-1 border-t-2 border-copper-700/60" />
        {/* "Dungeon" text */}
        <span className="mx-2 text-xs text-stone-500 tracking-wider uppercase">Dungeon</span>
        {/* Center icon - custom or fallback diamond */}
        {themeAssets.iconDungeonDetails ? (
          <img
            src={themeAssets.iconDungeonDetails}
            alt=""
            className="w-4 h-4 flex-shrink-0"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="w-2 h-2 rotate-45 bg-copper-600 border border-copper-500 flex-shrink-0" />
        )}
        {/* "Details" text */}
        <span className="mx-2 text-xs text-stone-500 tracking-wider uppercase">Details</span>
        {/* Right line segment */}
        <div className="flex-1 border-t-2 border-copper-700/60" />
      </div>
    </div>
  ) : null;

  const emptyContent = (
    <>
      {divider}
      <div className="flex items-center justify-center mb-2">
        <div className="relative flex items-center">
          <div className="absolute right-full mr-1">
            <HelpButton sectionId="enemies" />
          </div>
          <h3 className="text-lg lg:text-xl font-bold text-blood-400">Enemies</h3>
        </div>
      </div>
      <p className="text-sm lg:text-base text-stone-500 text-center">No enemies remaining</p>
    </>
  );

  if (uniqueEnemies.length === 0) {
    if (noPanel) {
      return <div className={className}>{emptyContent}</div>;
    }
    return (
      <div className={`dungeon-panel p-2 lg:p-3 ${className}`}>
        {emptyContent}
      </div>
    );
  }

  const content = (
    <>
      {divider}
      {/* Header row */}
      <div className="relative flex items-center justify-between mb-2">
        {/* Left: Test button */}
        <div className="flex items-center gap-2 min-w-[60px]">
          {showTestButton && onTest && (
            themeAssets.actionButtonTestEnemiesImage ? (
              <button
                onClick={onTest}
                className="transition-all hover:scale-105 active:scale-95"
                title="Watch enemies move without heroes for 5 turns"
              >
                <img
                  src={themeAssets.actionButtonTestEnemiesImage}
                  alt="Test Enemies"
                  className="h-5 lg:h-6 w-auto"
                  style={{ imageRendering: 'pixelated' }}
                />
              </button>
            ) : (
              <button
                onClick={onTest}
                className={`px-2 lg:px-2.5 py-px text-xs transition-colors flex items-center gap-1 ${
                  themeAssets.actionButtonTestEnemiesBg ? '' : 'bg-blood-800 hover:bg-blood-700 border border-blood-600 text-blood-100'
                } ${getShapeClass(themeAssets.actionButtonTestEnemiesShape)}`}
                style={{
                  ...(themeAssets.actionButtonTestEnemiesBg && { backgroundColor: themeAssets.actionButtonTestEnemiesBg }),
                  ...(themeAssets.actionButtonTestEnemiesBorder && { borderColor: themeAssets.actionButtonTestEnemiesBorder, borderWidth: '1px', borderStyle: 'solid' }),
                  ...(themeAssets.actionButtonTestEnemiesText && { color: themeAssets.actionButtonTestEnemiesText }),
                }}
                title="Watch enemies move without heroes for 5 turns"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Test
              </button>
            )
          )}
        </div>
        {/* Center: Help + Title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
          <div className="absolute right-full mr-1">
            <HelpButton sectionId="enemies" />
          </div>
          <h3 className="text-lg lg:text-xl font-bold text-blood-400">Enemies</h3>
        </div>
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
              className="px-1 py-1 bg-stone-800/80 rounded-pixel-md border border-blood-900/50 flex flex-col items-center"
            >
              {/* HP and movement info - above sprite */}
              {(() => {
                const moveInfo = getEnemyMovementInfo(enemyData.behavior);
                return (
                  <div className="flex items-center justify-center mb-0.5 w-full">
                    {/* HP section */}
                    <div className="flex items-center justify-center gap-1 pr-2 border-r border-stone-600">
                      <span className="text-xs lg:text-sm font-medium text-blood-300">HP:</span>
                      <span className="text-sm lg:text-base font-bold text-blood-400">{enemyData.health}</span>
                    </div>
                    {/* Movement section */}
                    <div className="flex items-center justify-center gap-0.5 pl-2 text-blood-300">
                      {moveInfo && enemyData.behavior?.defaultFacing ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="opacity-60 text-blood-300">
                            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                          </svg>
                          <span className="text-xs font-medium text-stone-400">{moveInfo.tilesPerMove}</span>
                          <DirectionArrow direction={enemyData.behavior.defaultFacing} className="text-blood-300" size={10} />
                        </>
                      ) : (
                        <span className="text-xs text-stone-500">—</span>
                      )}
                    </div>
                  </div>
                );
              })()}

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
              <div className="mt-0.5 text-center max-w-[100px] lg:max-w-[120px] text-xs lg:text-sm !leading-[1.2]">
                <span className="font-medium text-blood-300">
                  {enemyData.name}
                </span>
                {enemyData.title && (
                  <span className="text-parchment-300 italic"> {enemyData.title}</span>
                )}
              </div>

              {/* Tooltip steps - always visible */}
              {hasTooltipSteps && (
                <ul className="mt-0.5 text-xs lg:text-sm !leading-[1.2] text-stone-400 text-left max-w-[160px] lg:max-w-[200px] list-disc list-inside break-words">
                  {enemyData.tooltipSteps!.map((step, idx) => (
                    <li key={idx}><RichTextRenderer html={step} /></li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  if (noPanel) {
    return <div className={className}>{content}</div>;
  }

  return (
    <div className={`dungeon-panel p-2 lg:p-3 ${className}`}>
      {content}
    </div>
  );
};
