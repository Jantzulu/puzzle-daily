import React, { useMemo } from 'react';
import type { Puzzle, TileBehaviorConfig } from '../../types/game';
import { loadTileType, loadPuzzleSkin, type CustomTileType, type CustomSprite } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';

interface SpecialTilesDisplayProps {
  puzzle: Puzzle;
}

// Information about a special tile to display
interface SpecialTileInfo {
  tileType: CustomTileType;
  sprite: CustomSprite | null;
  skinSpriteUrl: string | null;
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
 * Extracts all special tiles (custom tiles with behaviors) from a puzzle
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

      // Only include tiles that have behaviors
      if (!tileType.behaviors || tileType.behaviors.length === 0) continue;

      seenTileIds.add(tile.customTileTypeId);

      // Determine the sprite to use:
      // Priority 1: Skin-specific sprite URL
      // Priority 2: Tile type's default sprite
      const skinSpriteUrl = customTileSprites?.[tile.customTileTypeId] || null;
      const defaultSprite = tileType.customSprite || null;

      specialTiles.push({
        tileType,
        sprite: defaultSprite,
        skinSpriteUrl,
      });
    }
  }

  return specialTiles;
}

/**
 * Renders a tile sprite - handles both skin sprite URLs and CustomSprite
 */
const TileSprite: React.FC<{ info: SpecialTileInfo; size?: number }> = ({ info, size = 32 }) => {
  // Priority 1: Use skin-specific sprite URL
  if (info.skinSpriteUrl) {
    return (
      <img
        src={info.skinSpriteUrl}
        alt={info.tileType.name}
        className="rounded"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }

  // Priority 2: Use tile type's default CustomSprite
  if (info.sprite) {
    return <SpriteThumbnail sprite={info.sprite} size={size} />;
  }

  // Fallback: Show colored placeholder based on base type
  const bgColor = info.tileType.baseType === 'wall' ? 'bg-gray-600' : 'bg-gray-700';
  return (
    <div
      className={`${bgColor} rounded flex items-center justify-center`}
      style={{ width: size, height: size }}
    >
      <span className="text-xs text-gray-400">?</span>
    </div>
  );
};

export const SpecialTilesDisplay: React.FC<SpecialTilesDisplayProps> = ({ puzzle }) => {
  const specialTiles = useMemo(() => getSpecialTiles(puzzle), [puzzle]);

  // Don't render if no special tiles
  if (specialTiles.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 p-4 rounded">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Special Tiles</h3>
        <span className="text-sm text-gray-400">
          {specialTiles.length} type{specialTiles.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {specialTiles.map(({ tileType, sprite, skinSpriteUrl }) => (
          <div
            key={tileType.id}
            className="p-2 bg-gray-700 rounded"
          >
            <div className="flex items-start gap-3">
              {/* Tile sprite */}
              <div className="flex-shrink-0">
                <TileSprite info={{ tileType, sprite, skinSpriteUrl }} size={32} />
              </div>

              {/* Name and description */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-200">
                  {tileType.name}
                </div>
                {/* Use tile's description if available, otherwise generate from behaviors */}
                <div className="text-xs text-gray-400">
                  {tileType.description || getBehaviorDescription(tileType.behaviors)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
