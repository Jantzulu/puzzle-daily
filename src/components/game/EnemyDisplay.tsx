import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlacedEnemy, EnemyBehavior, ActionStep } from '../../types/game';
import { getEnemy } from '../../data/enemies';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { attributeText, attributeSubItems } from '../../utils/attributeShape';
import { HelpButton } from './HelpOverlay';
import { GemMesh } from './GemMesh';
import { LintelMesh } from './LintelMesh';
import { MovementArrow } from './DirectionArrow';
import type { ThemeAssets } from '../../utils/themeAssets';
import { CARD_PIXEL_SCALE, computeCardSpriteAreaHeight } from './cardConstants';
import { SlidingSelection } from './SlidingSelection';
import { subscribeToImageLoads } from '../../utils/imageLoader';

const MOVEMENT_TYPES = new Set([
  'move_forward', 'move_backward', 'move_left', 'move_right',
  'move_diagonal_ne', 'move_diagonal_nw', 'move_diagonal_se', 'move_diagonal_sw',
]);

// One-time coach line (2026-07-29): the enemy strip has no permanent hint
// row (heroes get one for free — it doubles as the placement instruction),
// so "Tap an enemy for more info" shows under the strip until the player's
// FIRST-EVER card tap, then never again on this device. Storage failure
// degrades to never showing the hint — better than showing it forever.
const ENEMY_HINT_KEY = 'enemy_card_hint_dismissed_v1';
const isEnemyHintDismissed = () => {
  try { return localStorage.getItem(ENEMY_HINT_KEY) === '1'; } catch { return true; }
};
const dismissEnemyHint = () => {
  try { localStorage.setItem(ENEMY_HINT_KEY, '1'); } catch { /* ditto */ }
};

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
  /**
   * Which party's units this instance tallies from puzzle.enemies.
   * 'enemy' (default) draws the Dungeon Details lintel and shows the
   * kill-target roster; 'ally' lists hero-party units (placed allies) and
   * renders nothing when the puzzle has none.
   */
  side?: 'enemy' | 'ally';
}

export const EnemyDisplay: React.FC<EnemyDisplayProps> = ({
  enemies,
  onTest,
  showTestButton = false,
  themeAssets = {},
  className = '',
  noPanel = false,
  side = 'enemy',
}) => {
  const isAllySide = side === 'ally';
  // Info panel animation state — grid 0fr→1fr so easing applies to real content height.
  // Double rAF ensures browser paints the closed (0fr) state before opening.
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  // Coach line renders only on the Enemies side (no duplicate under Allies);
  // a tap on either side's cards writes the dismissal flag.
  const [showTapHint, setShowTapHint] = useState(() => !isAllySide && !isEnemyHintDismissed());
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
  const enemyGroups = new Map<string, { totalCount: number; livingCount: number; scheduled: Array<{ firstTurn: number; repeatEvery?: number }> }>();
  for (const enemy of enemies) {
    // Scheduled-visitor TEMPLATES are despawned but announce FUTURE arrivals
    // — the info panels preview everything (full-disclosure rule,
    // 2026-07-21), so they get a card with a visits label instead of
    // vanishing. Departed copies (spawnedOnTurn set) and expired summons
    // still drop from the tally entirely instead of counting as slain.
    const isTemplate = enemy.despawned && enemy.recurrence !== undefined && enemy.spawnedOnTurn === undefined;
    if (enemy.despawned && !isTemplate) continue;
    // Party split: the enemy tally shows kill targets only; the ally tally
    // shows hero-party units (placed allies, hero-side summons). Explicit
    // stamp check: the quest label does the full entityParty derivation,
    // but everything hero-party here carries the explicit field.
    if (isAllySide ? enemy.party !== 'hero' : enemy.party === 'hero') continue;
    let group = enemyGroups.get(enemy.enemyId);
    if (!group) {
      group = { totalCount: 0, livingCount: 0, scheduled: [] };
      enemyGroups.set(enemy.enemyId, group);
    }
    if (isTemplate) {
      group.scheduled.push({ firstTurn: enemy.recurrence!.firstTurn, repeatEvery: enemy.recurrence!.repeatEvery });
    } else {
      group.totalCount++;
      if (!enemy.dead) group.livingCount++;
    }
  }
  const uniqueEnemyIds = Array.from(enemyGroups.keys());
  // Only ids that resolve to real assets render cards — the sliding
  // selection overlay's slot math must index within this same list.
  const stripEnemyIds = uniqueEnemyIds.filter((id) => !!getEnemy(id));

  // Uniform card sprite-area height across the enemy row — derived from the
  // tallest native sprite × CARD_PIXEL_SCALE. Prevents clipping of the
  // tallest sprite's head and keeps all cards the same height.
  // imageLoadTrigger forces a re-compute when any sprite image finishes
  // loading (see CharacterSelector for rationale).
  const [imageLoadTrigger, setImageLoadTrigger] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeToImageLoads(() => {
      setImageLoadTrigger(prev => prev + 1);
    });
    return unsubscribe;
  }, []);
  const cardSpriteHeight = useMemo(() => {
    return computeCardSpriteAreaHeight(
      uniqueEnemyIds.map(id => getEnemy(id)?.customSprite)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggers intentional
  }, [uniqueEnemyIds.join(','), imageLoadTrigger]);

  // The measured name-block machinery is gone: the hero cards' fixed
  // 38px name band (ported here 2026-08-01) keeps every card the same
  // height by construction.
  const totalLiving = Array.from(enemyGroups.values()).reduce((sum, g) => sum + g.livingCount, 0);

  // Rendered enemy info
  const renderedEnemyData = renderedEnemyId ? getEnemy(renderedEnemyId) : null;

  // Resolve actionSteps — use new field, fall back to legacy tooltipSteps
  const actionSteps: ActionStep[] =
    renderedEnemyData?.actionSteps ??
    (renderedEnemyData?.tooltipSteps?.map(t => ({ text: t })) ?? []);
  const hasActionSteps = actionSteps.length > 0;
  const hasAttributes = (renderedEnemyData?.attributes?.length ?? 0) > 0;

  // Selected glow — red for enemies, warm gold for allies
  const selectedGlow = isAllySide
    ? 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(214,158,70,0.9)) drop-shadow(0 0 7px rgba(214,158,70,0.5))'
    : 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(180,50,50,0.9)) drop-shadow(0 0 7px rgba(180,50,50,0.5))';

  // "Dungeon Details" threshold shown in noPanel mode — a course of hewn
  // stone blocks (LintelMesh) marking the doorway between the heroes'
  // panel and the dungeon, with the label engraved on the stone.
  // Only the ENEMY instance draws it — it opens the whole section; the
  // ally instance renders below it as a sibling box.
  const divider = noPanel && !isAllySide ? (
    <div className="dungeon-lintel mt-2 mb-2">
      <LintelMesh />
      <span className="dungeon-lintel-text font-medieval">
        <span>Dungeon</span>
        {themeAssets.iconDungeonDetails ? (
          <img
            src={themeAssets.iconDungeonDetails}
            alt=""
            className="w-4 h-4 flex-shrink-0"
            style={{ imageRendering: 'pixelated' }}
            loading="lazy" decoding="async"
          />
        ) : (
          <span className="dungeon-lintel-gem" />
        )}
        <span>Details</span>
      </span>
    </div>
  ) : null;

  // Empty state. No allies is the NORM — the ally instance disappears
  // entirely rather than announcing an empty box.
  if (uniqueEnemyIds.length === 0 && isAllySide) return null;
  if (uniqueEnemyIds.length === 0) {
    const emptyContent = (
      <>
        {divider}
        <div className="flex items-center justify-center mb-2">
          <div className="relative flex items-center">
            <div className="absolute right-full mr-1">
              <HelpButton sectionId="enemies" />
            </div>
            <h3 className="carved-header carved-header-blood font-medieval text-lg lg:text-xl uppercase">Enemies</h3>
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
                className="transition-all hover:scale-105 active:scale-95 hit-44"
                title="Watch enemies move without heroes for 5 turns"
              >
                <img
                  src={themeAssets.actionButtonTestEnemiesImage}
                  alt="Test Enemies"
                  className="h-5 lg:h-6 w-auto"
                  style={{ imageRendering: 'pixelated' }}
                  loading="lazy" decoding="async"
                />
              </button>
            ) : (
              <button
                onClick={onTest}
                className="gem-btn px-2 lg:px-2.5 py-px text-xs transition-colors flex items-center gap-1 hit-44"
                title="Watch enemies move without heroes for 5 turns"
              >
                {/* Ruby stone — supersedes the legacy flat theme colors
                    (custom theme IMAGES still win via the branch above) */}
                <GemMesh tone="ruby" phase={260} />
                <span className="flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Test
                </span>
              </button>
            )
          )}
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
          <div className="absolute right-full mr-1">
            <HelpButton sectionId={isAllySide ? 'allies' : 'enemies'} />
          </div>
          {/* Same register pass as the HEROES title (2026-08-01): uppercase
              transform on the classic carve/face/size; each side keeps its
              own identity color. */}
          <h3 className={`carved-header ${isAllySide ? 'carved-header-parchment' : 'carved-header-blood'} font-medieval text-lg lg:text-xl uppercase`}>
            {isAllySide ? 'Allies' : 'Enemies'}
          </h3>
        </div>
        {/* Counter in the ramp's registers, matching the hero panel's
            "N/M placed": the count is a stat value (hud-num, tabular),
            the word is furniture (hud-label, uppercase). */}
        <span className="flex items-baseline gap-1">
          <span className="hud-num text-stone-400">{totalLiving}</span>
          <span className="hud-label text-stone-400">remaining</span>
        </span>
      </div>

      {/* Enemy strip — equal-width slots separated by vertical dividers.
          Selection tint + caret ride the SlidingSelection overlay (in a
          relative wrapper OUTSIDE the divide-x row so the dividers don't
          border the overlay divs) and glide between slots. Slot math must
          index the same filtered list the cards render from. */}
      <div className="relative">
      <SlidingSelection
        slotCount={stripEnemyIds.length}
        selectedIndex={selectedEnemyId ? stripEnemyIds.indexOf(selectedEnemyId) : -1}
        caretClass={isAllySide ? 'text-copper-400' : 'text-blood-400'}
      />
      <div className="flex divide-x divide-stone-700">
        {stripEnemyIds.map((enemyId) => {
          const enemyData = getEnemy(enemyId);
          if (!enemyData) return null;

          const { totalCount, livingCount, scheduled } = enemyGroups.get(enemyId)!;
          const isSelected = selectedEnemyId === enemyId;
          // Scheduled-only cards (visitor templates, nothing on the board
          // yet) read as "not here yet", not as slain.
          const scheduledOnly = totalCount === 0;
          const allDead = totalCount > 0 && livingCount === 0;
          const moveInfo = getEnemyMovementInfo(enemyData.behavior);
          const visitLabels = Array.from(new Set(scheduled.map(s =>
            s.repeatEvery && s.repeatEvery > 0
              ? `Visits turn ${s.firstTurn}, every ${s.repeatEvery}`
              : `Visits turn ${s.firstTurn}`
          )));

          // Card layout matched to the hero cards (2026-08-01, user call):
          // same fixed bands (sprite / 38px name+epithet / 14px stat line),
          // same HUD registers, same real-<button> semantics — the two
          // strips read as one design. Identity colors stay per side (blood
          // names/badges/tints here, arcane on the hero strip); the stat
          // line's furniture is the shared semantic vocabulary (copper
          // labels, --hud-vital health).
          return (
            <button
              key={enemyId}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                if (!isEnemyHintDismissed()) dismissEnemyHint();
                if (showTapHint) setShowTapHint(false);
                setSelectedEnemyId(isSelected ? null : enemyId);
              }}
              className={`flex-1 flex flex-col items-center px-1 pt-0.5 pb-2 relative transition-colors cursor-pointer ${
                isSelected
                  // Flat tint matching the info panel's wash — one surface;
                  // transition-colors crossfades it between cards (the tint
                  // deliberately does not slide — see SlidingSelection).
                  ? (isAllySide ? 'bg-copper-900/15' : 'bg-blood-900/15')
                  : '[@media(hover:hover)]:hover:bg-stone-700/30'
              } ${allDead ? 'opacity-50' : scheduledOnly ? 'opacity-60' : ''}`}
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
                  cardRole="enemy"
                />
                {totalCount > 1 && (
                  <span className="absolute -top-1 -right-1 text-xs bg-blood-900 text-blood-300 px-1 py-0.5 rounded-pixel min-w-[18px] text-center border border-blood-700 leading-none">
                    {totalCount}
                  </span>
                )}
              </div>

              {/* NAME + epithet — the hero cards' fixed 38px box, one
                  clamped line each, full text in `title`. */}
              <div className="w-full h-[38px] flex flex-col items-center justify-center overflow-hidden leading-none">
                <span
                  className="hud-title text-blood-300 text-center break-words line-clamp-1"
                  title={enemyData.title ? `${enemyData.name} — ${enemyData.title}` : enemyData.name}
                >
                  {enemyData.name}
                </span>
                {enemyData.title && (
                  <span className="mt-0.5 text-[10px] italic text-parchment-300/90 text-center line-clamp-1">
                    {enemyData.title}
                  </span>
                )}
              </div>

              {/* STAT LINE — the hero cards' 14px row: no divider rule, a
                  real 12px gap; HP label + tabular value in the semantic
                  colors. */}
              <div className="flex items-center justify-center gap-3 w-full h-[14px]">
                <div className="flex items-center gap-1">
                  <span className="hud-label text-copper-400">HP</span>
                  <span className="hud-num" style={{ color: 'var(--hud-vital)' }}>
                    {enemyData.health}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-copper-400">
                  {moveInfo && enemyData.behavior?.defaultFacing ? (
                    <>
                      {moveInfo.tilesPerMove > 1 && (
                        <span className="hud-num">{moveInfo.tilesPerMove}</span>
                      )}
                      <MovementArrow direction={enemyData.behavior.defaultFacing} className="text-copper-400" size={13} />
                    </>
                  ) : (
                    <span className="hud-num text-stone-400">—</span>
                  )}
                </div>
              </div>

              {/* Scheduled visits (full-disclosure preview) */}
              {visitLabels.length > 0 && (
                <div className="text-[9px] text-copper-300 leading-tight mt-0.5 text-center w-full">
                  {visitLabels.join(' · ')}
                </div>
              )}

              {/* No per-card "more info" affordance — mirrors the hero
                  strip: the first tap teaches that cards open; the selected
                  amber caret rides the SlidingSelection overlay. */}
            </button>
          );
        })}
      </div>
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
            className="pt-2.5 pb-3 mt-0 bg-blood-900/15 rounded-b-pixel-md"
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
                  <div className={`${hasAttributes ? 'flex-1 min-w-0 pr-2' : 'w-full'}`}>
                    {/* Drawer typography = the hero drawer's HUD ramp
                        (2026-08-01): hud-label headers, hud-body copy. */}
                    <p className="hud-label text-stone-400 mb-1 text-center">Actions</p>
                    <ol className="hud-body text-stone-300 space-y-1 pl-2">
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
                  <div className={`${hasActionSteps ? 'flex-1 min-w-0 pl-2' : 'w-full'}`}>
                    <p className="hud-label text-stone-400 mb-1 text-center">Attributes</p>
                    <ul className="hud-body text-stone-300 space-y-1">
                      {renderedEnemyData.attributes!.map((attr, idx) => (
                        <li key={idx}>
                          <div className="flex items-baseline gap-1">
                            <span className="text-stone-400 flex-shrink-0">•</span>
                            <RichTextRenderer html={attributeText(attr)} />
                          </div>
                          {(attributeSubItems(attr) || []).map((sub, subIdx) => (
                            <div key={subIdx} className="flex items-baseline gap-1 ml-3 mt-0.5">
                              <span className="text-stone-500 flex-shrink-0">◦</span>
                              <RichTextRenderer html={sub} />
                            </div>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {!hasActionSteps && !hasAttributes && (
              <p className="hud-body text-stone-500 text-center mb-3 italic">No additional info.</p>
            )}
          </div>
        </div>
        </div>
      )}

      {/* One-time coach line — styled like the hero strip's hint row. */}
      {showTapHint && uniqueEnemyIds.length > 0 && (
        <div className="mt-1.5 text-sm font-medium text-center min-h-[20px]">
          <span className="text-stone-500">Tap an enemy for more info</span>
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
