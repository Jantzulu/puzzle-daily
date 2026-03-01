import React from 'react';
import { getCharacter } from '../../data/characters';
import type { CharacterAction } from '../../types/game';
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

interface CharacterSelectorProps {
  availableCharacterIds: string[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
  placedCharacterIds?: string[];
  maxPlaceable?: number; // Max heroes player can place (defaults to availableCharacterIds.length)
  onClearAll?: () => void;
  onTest?: () => void;
  themeAssets?: ThemeAssets;
  disabled?: boolean;
  noPanel?: boolean; // If true, renders without the dungeon-panel wrapper
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
}) => {
  // If maxPlaceable not specified, default to number of available characters
  const effectiveMaxPlaceable = maxPlaceable ?? availableCharacterIds.length;
  const isAtMaxPlaced = placedCharacterIds.length >= effectiveMaxPlaceable;
  // Determine button shape class
  const getShapeClass = (shape?: string) => {
    switch (shape) {
      case 'rounded': return 'rounded-lg';
      case 'pill': return 'rounded-full';
      default: return 'rounded';
    }
  };

  const content = (
    <>
      {/* Header row */}
      <div className="relative flex items-center justify-between mb-2">
        {/* Left: Help + Title */}
        <div className="flex items-center gap-2">
          <HelpButton sectionId="characters" />
          <h3 className="text-lg lg:text-xl font-bold text-purple-400">Heroes</h3>
        </div>
        {/* Center: Test button (centered on both mobile and desktop) */}
        {onTest && !disabled && (
          themeAssets.actionButtonTestHeroesImage ? (
            // Custom image button
            <button
              onClick={onTest}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-105 active:scale-95"
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
            // Default styled button
            <button
              onClick={onTest}
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 lg:px-2.5 py-px text-xs transition-colors flex items-center gap-1 ${
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
        {/* Right: Count + Clear button */}
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

      <div className="flex flex-wrap gap-2 justify-center">
        {availableCharacterIds.map((charId) => {
          const character = getCharacter(charId);
          if (!character) return null;

          const isSelected = selectedCharacterId === charId;
          const isPlaced = placedCharacterIds.includes(charId);
          const hasTooltipSteps = character.tooltipSteps && character.tooltipSteps.length > 0;
          // Can't select if disabled, already placed, or at max and not already selected
          const cannotSelect = disabled || isPlaced || (isAtMaxPlaced && !isSelected);

          return (
            <div
              key={charId}
              onClick={() => !cannotSelect && onSelectCharacter(isSelected ? null : charId)}
              className={`rounded-pixel-md px-2 py-1 transition-all flex flex-col items-center border-2 min-w-[80px] ${
                disabled
                  ? 'bg-stone-800/80 border-stone-600 cursor-default'
                  : isPlaced
                  ? 'bg-stone-900/80 border-dashed border-stone-600 opacity-60 cursor-not-allowed'
                  : isAtMaxPlaced && !isSelected
                  ? 'bg-stone-800/80 border-stone-600 opacity-50 cursor-not-allowed'
                  : isSelected
                  ? 'bg-copper-800/80 border-copper-500 shadow-torch cursor-pointer'
                  : 'bg-stone-800/80 border-stone-600 hover:bg-stone-700 hover:border-copper-600 cursor-pointer'
              }`}
            >
              {/* HP and movement info - above sprite */}
              {(() => {
                const moveInfo = getMovementInfo(character.behavior);
                return (
                  <div className="flex items-center justify-center mb-0.5 w-full">
                    {/* HP section */}
                    <div className={`flex items-center justify-center gap-1 pr-2 border-r border-stone-600`}>
                      <span className={`text-xs lg:text-sm font-medium ${isSelected ? 'text-parchment-100' : 'text-copper-400'}`}>HP:</span>
                      <span className={`text-sm lg:text-base font-bold ${isSelected ? 'text-parchment-100' : ''}`} style={isSelected ? undefined : { color: '#4ade80' }}>{character.health}</span>
                    </div>
                    {/* Movement section */}
                    <div className={`flex items-center justify-center gap-0.5 pl-2 ${isSelected ? 'text-parchment-100' : 'text-copper-400'}`}>
                      {moveInfo ? (
                        <>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className={`opacity-60 ${isSelected ? 'text-parchment-100' : 'text-copper-400'}`}>
                            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                          </svg>
                          <span className={`text-xs font-medium ${isSelected ? 'text-parchment-100' : 'text-stone-400'}`}>{moveInfo.tilesPerMove}</span>
                          <DirectionArrow direction={character.defaultFacing} className={isSelected ? 'text-parchment-100' : 'text-copper-400'} size={10} />
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
                <SpriteThumbnail sprite={character.customSprite} size={56} previewType="entity" />
                {isPlaced && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-pixel">
                    <span className="text-copper-400 text-lg">✓</span>
                  </div>
                )}
              </div>

              {/* Name and Title */}
              <div className="mt-0.5 text-center max-w-[100px] lg:max-w-[120px] text-xs lg:text-sm !leading-[1.2]">
                <span className={`font-medium ${
                  isSelected ? 'text-parchment-100' : 'text-parchment-300'
                }`}>
                  {character.name}
                </span>
                {character.title && (
                  <span className={`italic ${
                    isSelected ? 'text-copper-200' : 'text-stone-500'
                  }`}> {character.title}</span>
                )}
              </div>

              {/* Tooltip steps - always visible */}
              {hasTooltipSteps && (
                <ul className={`mt-0.5 text-xs lg:text-sm !leading-[1.2] text-left max-w-[100px] lg:max-w-[120px] list-disc list-inside ${
                  isSelected ? 'text-copper-200' : 'text-stone-400'
                }`}>
                  {character.tooltipSteps!.map((step, idx) => (
                    <li key={idx}><RichTextRenderer html={step} /></li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {selectedCharacterId && (
        <div className="mt-3 pt-3 border-t border-stone-700 text-sm lg:text-base text-copper-400 font-medium text-center">
          Click on the dungeon to place your hero
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
