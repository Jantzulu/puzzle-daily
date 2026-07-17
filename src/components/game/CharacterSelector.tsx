import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getCharacter } from '../../data/characters';
import type { CharacterAction, PlacedCharacter, Direction } from '../../types/game';
import { loadSpellAsset } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { GemMesh } from './GemMesh';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { HelpButton } from './HelpOverlay';
import { DirectionArrow } from './DirectionArrow';
import type { ThemeAssets } from '../../utils/themeAssets';
import { CARD_PIXEL_SCALE, computeCardSpriteAreaHeight } from './cardConstants';
import { SlidingSelection } from './SlidingSelection';
import { subscribeToImageLoads } from '../../utils/imageLoader';

const MOVEMENT_TYPES = new Set([
  'move_forward', 'move_backward', 'move_left', 'move_right',
  'move_diagonal_ne', 'move_diagonal_nw', 'move_diagonal_se', 'move_diagonal_sw',
]);

function getMovementInfo(behavior: CharacterAction[]) {
  const moveAction = behavior.find(a => MOVEMENT_TYPES.has(a.type));
  return moveAction ? { tilesPerMove: moveAction.tilesPerMove || 1 } : null;
}

// SVG arrow component for consistent rendering across platforms
const CompassArrow: React.FC<{ direction: string; size?: number; className?: string }> = ({ direction, size = 10, className = '' }) => {
  const rotations: Record<string, number> = {
    north: 0, northeast: 45, east: 90, southeast: 135,
    south: 180, southwest: 225, west: 270, northwest: 315,
  };
  const rotation = rotations[direction] ?? 0;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className={className} style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="M5 1L8 7H2Z" fill="currentColor" />
    </svg>
  );
};

const COMPASS_DIRS: { value: Direction; dir: string }[] = [
  { value: 'northwest' as Direction, dir: 'northwest' },
  { value: 'north' as Direction, dir: 'north' },
  { value: 'northeast' as Direction, dir: 'northeast' },
  { value: 'west' as Direction, dir: 'west' },
  { value: 'east' as Direction, dir: 'east' },
  { value: 'southwest' as Direction, dir: 'southwest' },
  { value: 'south' as Direction, dir: 'south' },
  { value: 'southeast' as Direction, dir: 'southeast' },
];

interface CharacterSelectorProps {
  availableCharacterIds: string[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
  placedCharacterIds?: string[];
  maxPlaceable?: number;
  onClearAll?: () => void;
  onTest?: () => void;
  themeAssets?: ThemeAssets;
  disabled?: boolean;
  noPanel?: boolean;
  placedCharacters?: PlacedCharacter[];
  onSpellDirectionOverride?: (characterId: string, spellId: string, direction: Direction) => void;
  pendingSpellDirectionOverrides?: Record<string, Record<string, Direction>>;
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  availableCharacterIds,
  selectedCharacterId,
  onSelectCharacter,
  placedCharacterIds = [],
  maxPlaceable,
  onClearAll,
  onTest,
  themeAssets = {},
  disabled = false,
  noPanel = false,
  placedCharacters = [],
  onSpellDirectionOverride,
  pendingSpellDirectionOverrides = {},
}) => {
  const effectiveMaxPlaceable = maxPlaceable ?? availableCharacterIds.length;
  const isAtMaxPlaced = placedCharacterIds.length >= effectiveMaxPlaceable;

  // Uniform card sprite-area height across the hero row — derived from the
  // tallest native sprite in the row × CARD_PIXEL_SCALE. Prevents clipping
  // of the tallest sprite's head and keeps all cards the same height.
  //
  // imageLoadTrigger makes the memo re-run when any sprite image finishes
  // loading — important because some imported sprite sheets don't have
  // `frameHeight` stored in their config, and the fallback only resolves
  // to the correct value once the image itself is cached.
  const [imageLoadTrigger, setImageLoadTrigger] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeToImageLoads(() => {
      setImageLoadTrigger(prev => prev + 1);
    });
    return unsubscribe;
  }, []);
  const cardSpriteHeight = useMemo(() => {
    return computeCardSpriteAreaHeight(
      availableCharacterIds.map(id => getCharacter(id)?.customSprite)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- imageLoadTrigger intentionally forces re-compute after image loads
  }, [availableCharacterIds, imageLoadTrigger]);

  // Uniform name/title block height across the hero row — picks the max
  // rendered height of any card's name/title and applies it as min-height
  // to all of them. Ensures HP rows and everything below line up vertically
  // across cards regardless of name length (which varies with wrapping).
  const nameBlockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [maxNameBlockHeight, setMaxNameBlockHeight] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      let max = 0;
      for (const el of nameBlockRefs.current) {
        if (!el) continue;
        const h = el.offsetHeight;
        if (h > max) max = h;
      }
      if (max > 0) {
        setMaxNameBlockHeight(prev => (prev === max ? prev : max));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of nameBlockRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCharacterIds]);

  // Info panel animation: grid 0fr→1fr so easing applies to real content height.
  // Double rAF ensures browser paints the closed (0fr) state before opening.
  const [renderedCharId, setRenderedCharId] = useState<string | null>(selectedCharacterId);
  const [isOpen, setIsOpen] = useState(false);
  const prevCharIdRef = useRef<string | null>(selectedCharacterId);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevCharIdRef.current;
    prevCharIdRef.current = selectedCharacterId;
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (openRafRef.current) cancelAnimationFrame(openRafRef.current);

    if (selectedCharacterId !== null && prev === null) {
      // null → hero: mount closed, then animate open
      setRenderedCharId(selectedCharacterId);
      setIsOpen(false);
      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = requestAnimationFrame(() => setIsOpen(true));
      });
    } else if (selectedCharacterId !== null) {
      // hero → different hero: swap content instantly, stay open
      setRenderedCharId(selectedCharacterId);
      setIsOpen(true);
    } else if (prev !== null) {
      // hero → null: animate closed, then unmount
      setIsOpen(false);
      exitTimerRef.current = setTimeout(() => setRenderedCharId(null), 300);
    }
  }, [selectedCharacterId]);

  const renderedCharacter = renderedCharId ? getCharacter(renderedCharId) : null;
  const hasActionSteps = (renderedCharacter?.actionSteps?.length ?? 0) > 0;
  const hasAttributes = (renderedCharacter?.attributes?.length ?? 0) > 0;

  const redirectSpells = renderedCharacter
    ? renderedCharacter.behavior
        .filter(a => a.type === 'spell' && a.spellId)
        .map(a => loadSpellAsset(a.spellId!))
        .filter(s => s && s.templateType === 'redirect' && s.redirectAcceptsUserInput)
    : [];

  const placedSelectedChar = placedCharacters.find(pc => pc.characterId === renderedCharId);

  // Slot list for the strip + sliding selection overlay: only ids that
  // resolve to real characters render cards, so the overlay's slot math
  // must index within the same filtered list.
  const stripCharacterIds = availableCharacterIds.filter((id) => !!getCharacter(id));
  const selectedStripIndex = selectedCharacterId ? stripCharacterIds.indexOf(selectedCharacterId) : -1;

  const content = (
    <>
      {/* Header row — unchanged */}
      <div className="relative flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-[60px]">
          {onTest && !disabled && (
            themeAssets.actionButtonTestHeroesImage ? (
              <button
                onClick={onTest}
                className="transition-all hover:scale-105 active:scale-95"
                title="Test your heroes without enemies for 5 turns"
              >
                <img
                  src={themeAssets.actionButtonTestHeroesImage}
                  alt="Test Heroes"
                  className="h-5 lg:h-6 w-auto"
                  style={{ imageRendering: 'pixelated' }}
                  loading="lazy" decoding="async"
                />
              </button>
            ) : (
              <button
                onClick={onTest}
                className="gem-btn px-2 lg:px-2.5 py-px text-xs transition-colors flex items-center gap-1"
                title="Test your heroes without enemies for 5 turns"
              >
                {/* Amethyst stone — supersedes the legacy flat theme colors
                    (custom theme IMAGES still win via the branch above) */}
                <GemMesh tone="amethyst" phase={130} />
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
            <HelpButton sectionId="characters" />
          </div>
          <h3 className="carved-header carved-header-arcane font-medieval text-lg lg:text-xl">Heroes</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm lg:text-base ${isAtMaxPlaced ? 'text-copper-400' : 'text-stone-400'}`}>
            {placedCharacterIds.length}/{effectiveMaxPlaceable} placed
          </span>
          {onClearAll && placedCharacterIds.length > 0 && !disabled && (
            <button
              onClick={onClearAll}
              // -my-1: the 28px hit box is taller than the row's natural
              // ~20px text height — negative margin keeps the touch target
              // without growing the row when the button appears (the panel
              // below must not shift on hero placement)
              className="p-1 -my-1 text-stone-400 hover:text-blood-400 hover:bg-stone-700 rounded-pixel transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
              title="Remove all placed heroes"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Hero strip — equal-width slots separated by vertical dividers.
          The selection tint + caret live in a SlidingSelection overlay (in a
          relative wrapper OUTSIDE the divide-x flex row, so the dividers
          don't paint borders on the overlay divs) and glide between slots
          instead of snapping card-to-card. */}
      <div className="relative">
      <SlidingSelection
        slotCount={stripCharacterIds.length}
        selectedIndex={selectedStripIndex}
        caretClass="text-copper-400"
      />
      <div className="flex divide-x divide-stone-700">
        {stripCharacterIds.map((charId, charIndex) => {
          const character = getCharacter(charId);
          if (!character) return null;

          const isSelected = selectedCharacterId === charId;
          const isPlaced = placedCharacterIds.includes(charId);
          // Placed heroes are still clickable so the player can re-read their
          // card info after placing them. Placement itself is blocked
          // separately by Game.tsx's handleTileClick (alreadyPlaced check),
          // so selecting a placed hero just opens the info area.
          const cannotSelect = disabled || (isAtMaxPlaced && !isSelected && !isPlaced);
          const moveInfo = getMovementInfo(character.behavior);

          return (
            <div
              key={charId}
              onClick={() => !cannotSelect && onSelectCharacter(isSelected ? null : charId)}
              className={`flex-1 flex flex-col items-center px-1 pt-1 pb-0.5 relative transition-colors ${
                cannotSelect
                  ? 'opacity-40 cursor-not-allowed'
                  : isPlaced && isSelected
                  // Placed AND actively viewed: full brightness so the
                  // sprite/name/HP match the (full-brightness) info area
                  // below. The flat tint exactly matches the info area's
                  // bg-copper-900/15 so card + info read as ONE surface;
                  // transition-colors crossfades it between cards (the
                  // tint deliberately does not slide — see the design
                  // record in SlidingSelection).
                  ? 'cursor-pointer bg-copper-900/15'
                  : isPlaced
                  // Placed but NOT viewed: dim with opacity-50 + a hover
                  // tint. "Already placed, can't re-place" signal — the
                  // checkmark + dimmed sprite carry that.
                  ? 'opacity-50 cursor-pointer [@media(hover:hover)]:hover:bg-stone-700/30'
                  : isSelected
                  ? 'bg-copper-900/15 cursor-pointer'
                  : '[@media(hover:hover)]:hover:bg-stone-700/30 cursor-pointer'
              }`}
            >
              {/* Sprite — takes full card width, uniform height across the row */}
              <div className="relative w-full">
                <SpriteThumbnail
                  sprite={character.customSprite}
                  size={cardSpriteHeight}
                  fillWidth
                  previewType="entity"
                  noBackground
                  pixelScale={CARD_PIXEL_SCALE}
                  bottomAlign={!character.isFloating}
                  cardRole="hero"
                  cardSelected={isSelected}
                  cardPlaced={isPlaced}
                  canvasStyle={(isSelected && !isPlaced) ? { filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(212,165,116,0.9)) drop-shadow(0 0 7px rgba(212,165,116,0.5))' } : undefined}
                />
                {isPlaced && (
                  // Just the centered ✓ — no dark dim overlay. The outer
                  // card's opacity-50 already carries the "this hero is
                  // placed and can't be placed again" signal; adding a
                  // bg-black/40 dim on top of the sprite area produced a
                  // visible dark rectangle that read as a sprite container
                  // boundary, especially against the copper-tinted backdrop
                  // when a hero is selected for info re-read.
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-copper-400 text-base">✓</span>
                  </div>
                )}
              </div>

              {/* Name + Title (below sprite).
                  Separate block divs for tight vertical spacing control.
                  Container carries a ref + shared minHeight so all cards
                  in the row have the same name-block height, aligning the
                  HP/info/caret rows below across cards. */}
              <div
                ref={(el) => { nameBlockRefs.current[charIndex] = el; }}
                className="text-center w-full mt-0.5 mb-0.5"
                style={{ minHeight: maxNameBlockHeight || undefined }}
              >
                <div className="text-[12px] font-medium break-words text-arcane-400 leading-none">
                  {character.name}
                </div>
                {character.title && (
                  <div className="text-[10px] italic text-parchment-300 leading-none mt-0.5">
                    {character.title}
                  </div>
                )}
              </div>

              {/* Attribute row: HP + movement */}
              <div className="flex items-center justify-center mt-0.5 w-full">
                <div className="flex items-center gap-0.5 pr-1.5 border-r border-stone-600">
                  <span className="text-xs font-medium text-copper-400">HP:</span>
                  <span className="text-xs font-bold" style={{ color: '#4ade80' }}>
                    {character.health}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 pl-1.5 text-copper-400">
                  {moveInfo ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
                        <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                      </svg>
                      <span className="text-xs font-medium">{moveInfo.tilesPerMove}</span>
                      <DirectionArrow direction={character.defaultFacing} className="text-copper-400" size={8} />
                    </>
                  ) : (
                    <span className="text-xs text-stone-500">—</span>
                  )}
                </div>
              </div>

              {/* "More Info" + down caret (unselected), or up caret straddling boundary (selected) */}
              <div className="mt-0.5 flex flex-col items-center justify-center" style={{ minHeight: '20px' }}>
                {!isSelected && !cannotSelect && (
                  <span className="text-[9px] text-stone-500 leading-none">More Info</span>
                )}
                {!isSelected && (
                  <svg width="12" height="7" viewBox="0 0 12 7" fill="currentColor" className="text-stone-600 mt-0.5">
                    <path d="M6 7L0 0h12z" />
                  </svg>
                )}
              </div>
              {/* Selected caret now lives in the SlidingSelection overlay */}
            </div>
          );
        })}
      </div>
      </div>

      {/* Info area — grid height animation so easing applies to real content height.
          Only rendered when the hero actually HAS info content: an info-less
          hero used to open an empty tinted box holding just the placement
          hint, expanding the panel at selection (read as the trash button
          displacing the layout). The hint now lives in a static row below. */}
      {renderedCharId && renderedCharacter && (hasActionSteps || hasAttributes || redirectSpells.length > 0) && (
        <div style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: isOpen
            ? 'grid-template-rows 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'grid-template-rows 0.28s ease-in',
        }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div
          className="pt-4 pb-3 mt-0 bg-copper-900/15 rounded-b-pixel-md"
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0)' : 'translateY(-8px)',
            transition: isOpen
              ? 'opacity 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'opacity 0.2s ease-in, transform 0.3s ease-in',
          }}
        >

          {/* Action Steps + Attributes: split 50/50 if both present, full-width centered if only one */}
          {(hasActionSteps || hasAttributes) && (
            <div className={`flex mb-2 px-2 ${hasActionSteps && hasAttributes ? 'gap-0' : 'justify-center'}`}>
              {hasActionSteps && (
                <div className={`${hasAttributes ? 'flex-1 pr-2' : 'w-full'}`}>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 text-center">Actions</p>
                  <ol className="text-xs lg:text-sm text-stone-300 space-y-1 pl-2">
                    {renderedCharacter.actionSteps!.map((step, idx) => (
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
                    {renderedCharacter.attributes!.map((attr, idx) => (
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

          {/* Redirect spell compass */}
          {redirectSpells.map(spell => {
            if (!spell) return null;
            const currentDir: Direction = (
              placedSelectedChar?.spellDirectionOverrides?.[spell.id]
              || pendingSpellDirectionOverrides[renderedCharId]?.[spell.id]
              || 'north'
            ) as Direction;

            if (disabled || !onSpellDirectionOverride) {
              return (
                <div key={spell.id} className="flex items-center justify-center gap-1 mb-1">
                  <CompassArrow direction={currentDir} size={14} className="text-purple-300" />
                  <span className="text-[10px] text-purple-300 capitalize">{currentDir}</span>
                </div>
              );
            }

            return (
              <div key={spell.id} className="flex flex-col items-center gap-1 mb-2">
                <div className="relative w-full flex items-center justify-center">
                  <div className="absolute left-2">
                    <HelpButton sectionId="redirect_spell" className="!p-0" />
                  </div>
                  <span className="text-[9px] text-purple-300 font-medium">{spell.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-px" style={{ width: '54px' }}>
                  {[
                    ...COMPASS_DIRS.slice(0, 4),
                    null,
                    ...COMPASS_DIRS.slice(4),
                  ].map((d, i) => d ? (
                    <button
                      key={d.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedCharacterId) onSpellDirectionOverride?.(selectedCharacterId, spell.id, d.value);
                      }}
                      className={`w-[17px] h-[17px] rounded-sm transition-colors flex items-center justify-center ${
                        currentDir === d.value
                          ? 'bg-purple-600 text-white border border-purple-400'
                          : 'bg-stone-700 text-stone-400 border border-stone-600 hover:bg-stone-600'
                      }`}
                    >
                      <CompassArrow direction={d.dir} size={9} />
                    </button>
                  ) : (
                    <div key={`center-${i}`} className="w-[17px] h-[17px]" />
                  ))}
                </div>
              </div>
            );
          })}

        </div>
        </div>
        </div>
      )}

      {/* Placement hint — statically sized (min-h reserves the line) so the
          text swap never moves the panel below. */}
      {!disabled && (
        <div className="mt-1.5 text-sm font-medium text-center min-h-[20px]">
          {isAtMaxPlaced ? null : selectedCharacterId && !placedCharacterIds.includes(selectedCharacterId) ? (
            <span className="text-copper-400">Click on the dungeon to place your hero</span>
          ) : (
            <span className="text-stone-500">Select a hero</span>
          )}
        </div>
      )}
    </>
  );

  if (noPanel) {
    return <div className={disabled ? 'opacity-60' : ''}>{content}</div>;
  }

  return (
    <div className={`dungeon-panel p-2 lg:p-3 ${disabled ? 'opacity-60' : ''}`}>
      {content}
    </div>
  );
};
