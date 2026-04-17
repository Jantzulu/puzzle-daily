import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlacedEnemy, EnemyBehavior, ActionStep } from '../../types/game';
import { getEnemy } from '../../data/enemies';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { HelpButton } from './HelpOverlay';
import { DirectionArrow } from './DirectionArrow';
import type { ThemeAssets } from '../../utils/themeAssets';
import { CARD_PIXEL_SCALE, computeCardSpriteAreaHeight } from './cardConstants';

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
  noPanel?: boolean;
}

export const EnemyDisplay: React.FC<EnemyDisplayProps> = ({
  enemies,
  onTest,
  showTestButton = false,
  themeAssets = {},
  className = '',
  noPanel = false,
}) => {
  const getShapeClass = (shape?: string) => {
    switch (shape) {
      case 'rounded': return 'rounded-lg';
      case 'pill': return 'rounded-full';
      default: return 'rounded';
    }
  };

  // Info panel animation state — grid 0fr→1fr so easing applies to real content height.
  // Double rAF ensures browser paints the closed (0fr) state before opening.
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const [renderedEnemyId, setRenderedEnemyId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const prevEnemyIdRef = useRef<string | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevEnemyIdRef.current;
    prevEnemyIdRef.current = selectedEnemyId;
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (openRafRef.current) cancelAnimationFrame(openRafRef.current);

    if (selectedEnemyId !== null && prev === null) {
      // null → enemy: mount closed, then animate open
      setRenderedEnemyId(selectedEnemyId);
      setIsOpen(false);
      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = requestAnimationFrame(() => setIsOpen(true));
      });
    } else if (selectedEnemyId !== null) {
      // enemy → different enemy: swap content instantly, stay open
      setRenderedEnemyId(selectedEnemyId);
      setIsOpen(true);
    } else if (prev !== null) {
      // enemy → null: animate closed, then unmount
      setIsOpen(false);
      exitTimerRef.current = setTimeout(() => setRenderedEnemyId(null), 300);
    }
  }, [selectedEnemyId]);

  // Group all enemies by type (alive + dead) for initial counts
  const enemyGroups = new Map<string, { totalCount: number; livingCount: number }>();
  for (const enemy of enemies) {
    const existing = enemyGroups.get(enemy.enemyId);
    if (existing) {
      existing.totalCount++;
      if (!enemy.dead) existing.livingCount++;
    } else {
      enemyGroups.set(enemy.enemyId, { totalCount: 1, livingCount: enemy.dead ? 0 : 1 });
    }
  }
  const uniqueEnemyIds = Array.from(enemyGroups.keys());

  // Uniform card sprite-area height across the enemy row — derived from the
  // tallest native sprite × CARD_PIXEL_SCALE. Prevents clipping of the
  // tallest sprite's head and keeps all cards the same height.
  const cardSpriteHeight = useMemo(() => {
    return computeCardSpriteAreaHeight(
      uniqueEnemyIds.map(id => getEnemy(id)?.customSprite)
    );
  }, [uniqueEnemyIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalLiving = Array.from(enemyGroups.values()).reduce((sum, g) => sum + g.livingCount, 0);

  // Rendered enemy info
  const renderedEnemyData = renderedEnemyId ? getEnemy(renderedEnemyId) : null;

  // Resolve actionSteps — use new field, fall back to legacy tooltipSteps
  const actionSteps: ActionStep[] =
    renderedEnemyData?.actionSteps ??
    (renderedEnemyData?.tooltipSteps?.map(t => ({ text: t })) ?? []);
  const hasActionSteps = actionSteps.length > 0;
  const hasAttributes = (renderedEnemyData?.attributes?.length ?? 0) > 0;

  // Selected glow — red variant matching enemy colour scheme
  const selectedGlow =
    'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(180,50,50,0.9)) drop-shadow(0 0 7px rgba(180,50,50,0.5))';

  // "DUNGEON ◆ DETAILS" divider shown in noPanel mode
  const divider = noPanel ? (
    <div className="mt-2 mb-1.5">
      <div className="relative flex items-center justify-center">
        <div className="flex-1 border-t-2 border-copper-700/60" />
        <span className="mx-2 text-xs text-stone-500 tracking-wider uppercase">Dungeon</span>
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
        <span className="mx-2 text-xs text-stone-500 tracking-wider uppercase">Details</span>
        <div className="flex-1 border-t-2 border-copper-700/60" />
      </div>
    </div>
  ) : null;

  // Empty state
  if (uniqueEnemyIds.length === 0) {
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
    return noPanel
      ? <div className={className}>{emptyContent}</div>
      : <div className={`dungeon-panel p-2 lg:p-3 ${className}`}>{emptyContent}</div>;
  }

  const content = (
    <>
      {divider}

      {/* Header row */}
      <div className="relative flex items-center justify-between mb-2">
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
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
          <div className="absolute right-full mr-1">
            <HelpButton sectionId="enemies" />
          </div>
          <h3 className="text-lg lg:text-xl font-bold text-blood-400">Enemies</h3>
        </div>
        <span className="text-sm lg:text-base text-stone-400">
          {totalLiving} remaining
        </span>
      </div>

      {/* Enemy strip — equal-width slots separated by vertical dividers */}
      <div className="flex divide-x divide-stone-700">
        {uniqueEnemyIds.map((enemyId) => {
          const enemyData = getEnemy(enemyId);
          if (!enemyData) return null;

          const { totalCount, livingCount } = enemyGroups.get(enemyId)!;
          const isSelected = selectedEnemyId === enemyId;
          const allDead = livingCount === 0;
          const moveInfo = getEnemyMovementInfo(enemyData.behavior);

          return (
            <div
              key={enemyId}
              onClick={() => setSelectedEnemyId(isSelected ? null : enemyId)}
              className={`flex-1 flex flex-col items-center px-1 pt-1 pb-0.5 relative transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-blood-900/15'
                  : '[@media(hover:hover)]:hover:bg-stone-700/30'
              } ${allDead ? 'opacity-50' : ''}`}
            >
              {/* Sprite — takes full card width, uniform height across the row */}
              <div className="relative w-full">
                <SpriteThumbnail
                  sprite={enemyData.customSprite}
                  size={cardSpriteHeight}
                  fillWidth
                  previewType="entity"
                  noBackground
                  pixelScale={CARD_PIXEL_SCALE}
                  bottomAlign={!enemyData.isFloating}
                  canvasStyle={isSelected ? { filter: selectedGlow } : undefined}
                />
                {totalCount > 1 && (
                  <span className="absolute -top-1 -right-1 text-xs bg-blood-900 text-blood-300 px-1 py-0.5 rounded-pixel min-w-[18px] text-center border border-blood-700 leading-none">
                    {totalCount}
                  </span>
                )}
              </div>

              {/* Name + Title (below sprite) */}
              <div className="text-center w-full mt-0.5 mb-0.5" style={{ lineHeight: 1.2 }}>
                <span className="text-xs font-medium break-words text-blood-300">
                  {enemyData.name}
                </span>
                {enemyData.title && (
                  <span className="text-xs italic text-parchment-300"> {enemyData.title}</span>
                )}
              </div>

              {/* HP + movement */}
              <div className="flex items-center justify-center mt-0.5 w-full">
                <div className="flex items-center gap-0.5 pr-1.5 border-r border-stone-600">
                  <span className="text-xs font-medium text-blood-300">HP:</span>
                  <span className="text-xs font-bold text-blood-400">{enemyData.health}</span>
                </div>
                <div className="flex items-center gap-0.5 pl-1.5 text-blood-300">
                  {moveInfo && enemyData.behavior?.defaultFacing ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
                        <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                      </svg>
                      <span className="text-xs font-medium">{moveInfo.tilesPerMove}</span>
                      <DirectionArrow direction={enemyData.behavior.defaultFacing} className="text-blood-300" size={8} />
                    </>
                  ) : (
                    <span className="text-xs text-stone-500">—</span>
                  )}
                </div>
              </div>

              {/* "More Info" + down caret (unselected) */}
              <div className="mt-0.5 flex flex-col items-center justify-center" style={{ minHeight: '20px' }}>
                {!isSelected && (
                  <>
                    <span className="text-[9px] text-stone-500 leading-none">More Info</span>
                    <svg width="12" height="7" viewBox="0 0 12 7" fill="currentColor" className="text-stone-600 mt-0.5">
                      <path d="M6 7L0 0h12z" />
                    </svg>
                  </>
                )}
              </div>

              {/* Selected: up-pointing caret straddling strip/panel boundary */}
              {isSelected && (
                <svg
                  width="14" height="8" viewBox="0 0 14 8" fill="currentColor"
                  className="text-blood-400 absolute z-10"
                  style={{ bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' }}
                >
                  <path d="M7 0L14 8H0z" />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Info panel — grid height animation so easing applies to real content height */}
      {renderedEnemyId && renderedEnemyData && (
        <div style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: isOpen
            ? 'grid-template-rows 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'grid-template-rows 0.28s ease-in',
        }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div
            className="pt-4 pb-3 mt-0 bg-blood-900/15 rounded-b-pixel-md"
            style={{
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? 'translateY(0)' : 'translateY(-8px)',
              transition: isOpen
                ? 'opacity 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
                : 'opacity 0.2s ease-in, transform 0.3s ease-in',
            }}
          >
            {(hasActionSteps || hasAttributes) && (
              <div className={`flex mb-2 px-2 ${hasActionSteps && hasAttributes ? 'gap-0' : 'justify-center'}`}>
                {hasActionSteps && (
                  <div className={`${hasAttributes ? 'flex-1 pr-2' : 'w-full'}`}>
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 text-center">Actions</p>
                    <ol className="text-xs lg:text-sm text-stone-300 space-y-1 pl-2">
                      {actionSteps.map((step, idx) => (
                        <li key={idx} className="flex items-baseline gap-1">
                          <span className="font-semibold text-stone-400 flex-shrink-0">{idx + 1}.</span>
                          <span>
                            <RichTextRenderer html={step.text} />
                            {step.subSteps && step.subSteps.length > 0 && (
                              <ul className="mt-0.5 space-y-1 text-stone-400">
                                {step.subSteps.map((sub, subIdx) => (
                                  <li key={subIdx} className="flex items-baseline gap-1">
                                    <span className="flex-shrink-0">•</span>
                                    <RichTextRenderer html={sub} />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {hasActionSteps && hasAttributes && (
                  <div className="self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40" />
                )}
                {hasAttributes && (
                  <div className={`${hasActionSteps ? 'flex-1 pl-2' : 'w-full'}`}>
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 text-center">Attributes</p>
                    <ul className="text-xs lg:text-sm text-stone-300 space-y-1">
                      {renderedEnemyData.attributes!.map((attr, idx) => (
                        <li key={idx} className="flex items-baseline gap-1">
                          <span className="text-stone-400 flex-shrink-0">•</span>
                          <RichTextRenderer html={attr} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {!hasActionSteps && !hasAttributes && (
              <p className="text-xs text-stone-500 text-center mb-3 italic">No additional info.</p>
            )}
          </div>
        </div>
        </div>
      )}
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
