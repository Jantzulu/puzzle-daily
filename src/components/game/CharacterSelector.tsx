import React, { useEffect, useRef, useState } from 'react';
import { getCharacter } from '../../data/characters';
import type { CharacterAction, PlacedCharacter, Direction } from '../../types/game';
import { loadSpellAsset } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { HelpButton } from './HelpOverlay';
import { DirectionArrow } from './DirectionArrow';
import type { ThemeAssets } from '../../utils/themeAssets';

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

  const getShapeClass = (shape?: string) => {
    switch (shape) {
      case 'rounded': return 'rounded-lg';
      case 'pill': return 'rounded-full';
      default: return 'rounded';
    }
  };

  // Info panel animation: track what to render (lags behind on exit) and which CSS class to apply
  const [renderedCharId, setRenderedCharId] = useState<string | null>(selectedCharacterId);
  const [panelAnimClass, setPanelAnimClass] = useState('');
  const prevCharIdRef = useRef<string | null>(selectedCharacterId);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevCharIdRef.current;
    prevCharIdRef.current = selectedCharacterId;
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    if (selectedCharacterId !== null && prev === null) {
      // null → hero: slide down
      setRenderedCharId(selectedCharacterId);
      setPanelAnimClass('animate-info-slide-down');
    } else if (selectedCharacterId === null && prev !== null) {
      // hero → null: slide up, then unmount
      setPanelAnimClass('animate-info-slide-up');
      exitTimerRef.current = setTimeout(() => {
        setRenderedCharId(null);
        setPanelAnimClass('');
      }, 300);
    } else if (selectedCharacterId !== null) {
      // hero → different hero: swap content, no animation
      setRenderedCharId(selectedCharacterId);
      setPanelAnimClass('');
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
                />
              </button>
            ) : (
              <button
                onClick={onTest}
                className={`px-2 lg:px-2.5 py-px text-xs transition-colors flex items-center gap-1 ${
                  themeAssets.actionButtonTestHeroesBg ? '' : 'bg-arcane-800 hover:bg-arcane-700 border border-arcane-600 text-arcane-100'
                } ${getShapeClass(themeAssets.actionButtonTestHeroesShape)}`}
                style={{
                  ...(themeAssets.actionButtonTestHeroesBg && { backgroundColor: themeAssets.actionButtonTestHeroesBg }),
                  ...(themeAssets.actionButtonTestHeroesBorder && { borderColor: themeAssets.actionButtonTestHeroesBorder, borderWidth: '1px', borderStyle: 'solid' }),
                  ...(themeAssets.actionButtonTestHeroesText && { color: themeAssets.actionButtonTestHeroesText }),
                }}
                title="Test your heroes without enemies for 5 turns"
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
            <HelpButton sectionId="characters" />
          </div>
          <h3 className="text-lg lg:text-xl font-bold text-purple-400">Heroes</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm lg:text-base ${isAtMaxPlaced ? 'text-copper-400' : 'text-stone-400'}`}>
            {placedCharacterIds.length}/{effectiveMaxPlaceable} placed
          </span>
          {onClearAll && placedCharacterIds.length > 0 && !disabled && (
            <button
              onClick={onClearAll}
              className="p-1 text-stone-400 hover:text-blood-400 hover:bg-stone-700 rounded-pixel transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
              title="Remove all placed heroes"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Hero strip — equal-width slots separated by vertical dividers */}
      <div className="flex divide-x divide-stone-700">
        {availableCharacterIds.map((charId) => {
          const character = getCharacter(charId);
          if (!character) return null;

          const isSelected = selectedCharacterId === charId;
          const isPlaced = placedCharacterIds.includes(charId);
          const cannotSelect = disabled || isPlaced || (isAtMaxPlaced && !isSelected);
          const moveInfo = getMovementInfo(character.behavior);

          return (
            <div
              key={charId}
              onClick={() => !cannotSelect && onSelectCharacter(isSelected ? null : charId)}
              className={`flex-1 flex flex-col items-center px-1 pt-1 pb-0.5 relative transition-colors ${
                isPlaced
                  ? 'opacity-50 cursor-not-allowed'
                  : cannotSelect
                  ? 'opacity-40 cursor-not-allowed'
                  : isSelected
                  ? 'bg-copper-900/15 cursor-pointer'
                  : '[@media(hover:hover)]:hover:bg-stone-700/30 cursor-pointer'
              }`}
            >
              {/* Name + Title */}
              <div className="text-center w-full mb-0.5" style={{ lineHeight: 1.2 }}>
                <span className="text-xs font-medium break-words text-arcane-400">
                  {character.name}
                </span>
                {character.title && (
                  <span className="text-xs italic text-parchment-300">
                    {' '}{character.title}
                  </span>
                )}
              </div>

              {/* Sprite */}
              <div className="relative flex-shrink-0">
                <SpriteThumbnail
                  sprite={character.customSprite}
                  size={52}
                  previewType="entity"
                  noBackground
                  spriteScale={1.8}
                  bottomAlign={!character.isFloating}
                  canvasStyle={(isSelected && !isPlaced) ? { filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(212,165,116,0.9)) drop-shadow(0 0 7px rgba(212,165,116,0.5))' } : undefined}
                />
                {isPlaced && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-pixel">
                    <span className="text-copper-400 text-base">✓</span>
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
              {/* Selected: up-pointing caret straddling the strip/tooltip boundary */}
              {isSelected && (
                <svg
                  width="14" height="8" viewBox="0 0 14 8" fill="currentColor"
                  className="text-copper-400 absolute z-10"
                  style={{ bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' }}
                >
                  <path d="M7 0L14 8H0z" />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Info area — animated drop-down when hero selected, slide-up on deselect */}
      {renderedCharId && renderedCharacter && (
        <div className={`overflow-hidden ${panelAnimClass}`}>
        <div className="pt-4 mt-0 bg-copper-900/15 rounded-b-pixel-md">

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
                        onSpellDirectionOverride(selectedCharacterId, spell.id, d.value);
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

          <div className="text-sm text-copper-400 font-medium text-center">
            Click on the dungeon to place your hero
          </div>
        </div>
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
