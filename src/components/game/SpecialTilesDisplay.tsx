import React, { useMemo } from 'react';
import type { Puzzle, TileBehaviorConfig, CadenceConfig } from '../../types/game';
import { loadTileType, loadPuzzleSkin, type CustomTileType, type CustomSprite } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { HelpButton } from './HelpOverlay';

interface SpecialTilesDisplayProps {
  puzzle: Puzzle;
}

// Information about a special tile to display
interface SpecialTileInfo {
  tileType: CustomTileType;
  sprite: CustomSprite | null;
  skinSpriteUrl: string | null;
  // Cadence-related fields
  hasCadence: boolean;
  cadence?: CadenceConfig;
  offStateSprite: CustomSprite | null;
  skinOffSpriteUrl: string | null;
  // Placement restriction
  preventPlacement: boolean;
  // Wall behavior
  behavesLikeWall: boolean;
}

/**
 * Get a human-readable description of a tile's behaviors
 */
function getBehaviorDescription(behaviors: TileBehaviorConfig[]): string {
  const descriptions: string[] = [];

  for (const behavior of behaviors) {
    switch (behavior.type) {
      case 'damage':
        if (behavior.damageOnce) {
          descriptions.push(`Deals ${behavior.damageAmount || 1} damage (once)`);
        } else {
          descriptions.push(`Deals ${behavior.damageAmount || 1} damage`);
        }
        break;
      case 'teleport':
        descriptions.push('Teleports to linked tiles');
        break;
      case 'direction_change':
        descriptions.push(`Changes facing to ${behavior.newFacing || 'a direction'}`);
        break;
      case 'ice':
        descriptions.push('Slides until hitting obstacle');
        break;
      case 'pressure_plate':
        const effects = behavior.pressurePlateEffects || [];
        if (effects.length > 0) {
          const effectTypes = effects.map(e => {
            switch (e.type) {
              case 'toggle_wall': return 'toggles walls';
              case 'spawn_enemy': return 'spawns enemies';
              case 'despawn_enemy': return 'removes enemies';
              case 'trigger_teleport': return 'triggers teleport';
              default: return e.type;
            }
          });
          descriptions.push(`Pressure plate (${effectTypes.join(', ')})`);
        } else {
          descriptions.push('Pressure plate');
        }
        break;
    }
  }

  return descriptions.join('; ');
}

/**
 * Extracts all special tiles (custom tiles with behaviors or special properties) from a puzzle
 */
function getSpecialTiles(puzzle: Puzzle): SpecialTileInfo[] {
  const seenTileIds = new Set<string>();
  const specialTiles: SpecialTileInfo[] = [];

  // Load the puzzle's skin for custom tile sprites
  const skin = puzzle.skinId ? loadPuzzleSkin(puzzle.skinId) : null;
  const customTileSprites = skin?.customTileSprites;

  // Scan all tiles in the puzzle grid
  for (const row of puzzle.tiles) {
    for (const tile of row) {
      if (!tile?.customTileTypeId) continue;
      if (seenTileIds.has(tile.customTileTypeId)) continue;

      const tileType = loadTileType(tile.customTileTypeId);
      if (!tileType) continue;

      // Include tiles that have behaviors OR prevent placement OR behave like wall
      const hasBehaviors = tileType.behaviors && tileType.behaviors.length > 0;
      const preventPlacement = tileType.preventPlacement || false;
      const behavesLikeWall = tileType.baseType === 'wall';

      if (!hasBehaviors && !preventPlacement && !behavesLikeWall) continue;

      seenTileIds.add(tile.customTileTypeId);

      // Determine the sprite to use:
      // Priority 1: Skin-specific sprite (may be string or object with on/off)
      // Priority 2: Tile type's default sprite
      const skinSprite = customTileSprites?.[tile.customTileTypeId];
      let skinSpriteUrl: string | null = null;
      let skinOffSpriteUrl: string | null = null;

      if (typeof skinSprite === 'string') {
        skinSpriteUrl = skinSprite;
      } else if (skinSprite && typeof skinSprite === 'object') {
        skinSpriteUrl = skinSprite.onSprite || null;
        skinOffSpriteUrl = skinSprite.offSprite || null;
      }

      const defaultSprite = tileType.customSprite || null;
      const offStateSprite = tileType.offStateSprite || null;
      const hasCadence = tileType.cadence?.enabled || false;

      specialTiles.push({
        tileType,
        sprite: defaultSprite,
        skinSpriteUrl,
        hasCadence,
        cadence: tileType.cadence,
        offStateSprite,
        skinOffSpriteUrl,
        preventPlacement,
        behavesLikeWall,
      });
    }
  }

  return specialTiles;
}

/**
 * Renders a tile sprite - handles both skin sprite URLs and CustomSprite
 */
const TileSprite: React.FC<{ info: SpecialTileInfo; size?: number; isOffState?: boolean }> = ({ info, size = 32, isOffState = false }) => {
  // Determine which sprite to use based on state
  const skinUrl = isOffState ? (info.skinOffSpriteUrl || info.skinSpriteUrl) : info.skinSpriteUrl;
  const sprite = isOffState ? (info.offStateSprite || info.sprite) : info.sprite;

  // Priority 1: Use skin-specific sprite URL
  if (skinUrl) {
    return (
      <img
        src={skinUrl}
        alt={`${info.tileType.name}${isOffState ? ' (off)' : ''}`}
        className="rounded"
        style={{ width: size, height: size, objectFit: 'contain', opacity: isOffState ? 0.6 : 1 }}
      />
    );
  }

  // Priority 2: Use tile type's CustomSprite
  if (sprite) {
    return (
      <div style={{ opacity: isOffState ? 0.6 : 1 }}>
        <SpriteThumbnail sprite={sprite} size={size} />
      </div>
    );
  }

  // Fallback: Show colored placeholder based on base type
  const bgColor = info.tileType.baseType === 'wall' ? 'bg-stone-600' : 'bg-stone-700';
  return (
    <div
      className={`${bgColor} rounded-pixel flex items-center justify-center`}
      style={{ width: size, height: size, opacity: isOffState ? 0.6 : 1 }}
    >
      <span className="text-xs text-stone-400">?</span>
    </div>
  );
};

/**
 * Get a human-readable description of a tile's cadence pattern
 */
function getCadenceDescription(cadence: CadenceConfig): string {
  if (!cadence.enabled) return '';

  const startStr = cadence.startState === 'off' ? 'starts off' : 'starts on';

  switch (cadence.pattern) {
    case 'alternating':
      return `Alternates on/off each turn (${startStr})`;
    case 'interval': {
      const on = cadence.onTurns || 1;
      const off = cadence.offTurns || 1;
      return `On for ${on} turn${on !== 1 ? 's' : ''}, off for ${off} (${startStr})`;
    }
    case 'custom':
      if (cadence.customPattern?.length) {
        const patternStr = cadence.customPattern.map(v => v ? '●' : '○').join('');
        return `Pattern: ${patternStr} (${startStr})`;
      }
      return `Custom pattern (${startStr})`;
    default:
      return '';
  }
}

export const SpecialTilesDisplay: React.FC<SpecialTilesDisplayProps> = ({ puzzle }) => {
  const specialTiles = useMemo(() => getSpecialTiles(puzzle), [puzzle]);

  // Don't render if no special tiles
  if (specialTiles.length === 0) {
    return null;
  }

  return (
    <div className="dungeon-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <h3 className="text-lg font-bold text-rust-400">Dungeon Tiles</h3>
          <HelpButton sectionId="special_tiles" />
        </div>
        <span className="text-sm text-stone-400">
          {specialTiles.length} type{specialTiles.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {specialTiles.map((info) => (
          <div
            key={info.tileType.id}
            className="p-2 bg-stone-800/80 rounded-pixel-md border border-rust-900/30"
          >
            <div className="flex items-start gap-3">
              {/* Tile sprite(s) */}
              <div className="flex-shrink-0">
                {info.hasCadence ? (
                  // Show both on and off sprites for cadenced tiles
                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <TileSprite info={info} size={28} isOffState={false} />
                      <div className="absolute -bottom-1 -right-1 text-[8px] bg-moss-700 text-white px-0.5 rounded-pixel">ON</div>
                    </div>
                    <span className="text-stone-500 text-xs">⇄</span>
                    <div className="relative">
                      <TileSprite info={info} size={28} isOffState={true} />
                      <div className="absolute -bottom-1 -right-1 text-[8px] bg-stone-600 text-white px-0.5 rounded-pixel">OFF</div>
                    </div>
                  </div>
                ) : (
                  // Single sprite for non-cadenced tiles
                  <TileSprite info={info} size={32} />
                )}
              </div>

              {/* Name and description */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-parchment-200 flex items-center gap-2 flex-wrap">
                  {info.tileType.name}
                  {info.hasCadence && (
                    <span className="text-copper-400 text-xs" title="Has on/off cadence">⟳</span>
                  )}
                </div>
                {/* Use tile's description if available, otherwise generate from behaviors */}
                <div className="text-xs text-stone-400">
                  {info.tileType.description || getBehaviorDescription(info.tileType.behaviors)}
                </div>
                {/* Show wall behavior info */}
                {info.behavesLikeWall && (
                  <div className="text-xs text-rust-400/70 mt-0.5">
                    Blocks movement (behaves like wall)
                  </div>
                )}
                {/* Show placement restriction info */}
                {info.preventPlacement && (
                  <div className="text-xs text-blood-400/70 mt-0.5">
                    Cannot place heroes on this tile
                  </div>
                )}
                {/* Show cadence info if applicable */}
                {info.hasCadence && info.cadence && (
                  <div className="text-xs text-copper-400/70 mt-0.5">
                    {getCadenceDescription(info.cadence)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
