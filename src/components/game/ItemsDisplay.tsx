import React, { useMemo } from 'react';
import type { Puzzle } from '../../types/game';
import { getCharacter, type CharacterWithSprite } from '../../data/characters';
import { getEnemy, type EnemyWithSprite } from '../../data/enemies';
import { loadCollectible, type CustomSprite, type CustomCollectible } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { HelpButton } from './HelpOverlay';

interface ItemsDisplayProps {
  puzzle: Puzzle;
  className?: string;
}

// Entity source info for an item drop
interface EntitySource {
  id: string;
  name: string;
  sprite?: CustomSprite;
  isEnemy: boolean;
}

// Item with optional drop sources
interface ItemWithSources {
  collectible: CustomCollectible;
  onMap: boolean;
  dropSources: EntitySource[];
}

/**
 * Extracts all items that appear in a puzzle (on map or from drops)
 */
function getPuzzleItemsWithSources(puzzle: Puzzle): ItemWithSources[] {
  // Map from collectible ID to item info
  const itemMap = new Map<string, ItemWithSources>();

  // First, add all collectibles that are on the map
  for (const placed of puzzle.collectibles) {
    if (placed.collectibleId) {
      const collectible = loadCollectible(placed.collectibleId);
      if (collectible) {
        if (!itemMap.has(collectible.id)) {
          itemMap.set(collectible.id, {
            collectible,
            onMap: true,
            dropSources: [],
          });
        } else {
          itemMap.get(collectible.id)!.onMap = true;
        }
      }
    }
  }

  // Check all available characters for death drops
  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character?.droppedCollectibleId) {
      const collectible = loadCollectible(character.droppedCollectibleId);
      if (collectible) {
        if (!itemMap.has(collectible.id)) {
          itemMap.set(collectible.id, {
            collectible,
            onMap: false,
            dropSources: [],
          });
        }
        const item = itemMap.get(collectible.id)!;
        if (!item.dropSources.some(s => s.id === charId)) {
          item.dropSources.push({
            id: charId,
            name: character.name,
            sprite: (character as CharacterWithSprite).customSprite,
            isEnemy: false,
          });
        }
      }
    }
  }

  // Check all enemies for death drops (unique enemy IDs)
  const seenEnemyIds = new Set<string>();
  for (const placedEnemy of puzzle.enemies) {
    if (seenEnemyIds.has(placedEnemy.enemyId)) continue;
    seenEnemyIds.add(placedEnemy.enemyId);

    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy?.droppedCollectibleId) {
      const collectible = loadCollectible(enemy.droppedCollectibleId);
      if (collectible) {
        if (!itemMap.has(collectible.id)) {
          itemMap.set(collectible.id, {
            collectible,
            onMap: false,
            dropSources: [],
          });
        }
        const item = itemMap.get(collectible.id)!;
        if (!item.dropSources.some(s => s.id === placedEnemy.enemyId)) {
          item.dropSources.push({
            id: placedEnemy.enemyId,
            name: enemy.name,
            sprite: (enemy as EnemyWithSprite).customSprite,
            isEnemy: true,
          });
        }
      }
    }
  }

  return Array.from(itemMap.values());
}

/**
 * Renders an item icon
 */
const ItemIcon: React.FC<{ collectible: CustomCollectible; size?: number }> = ({ collectible, size = 24 }) => {
  if (collectible.customSprite) {
    return <SpriteThumbnail sprite={collectible.customSprite} size={size} previewType="asset" />;
  }

  // Fallback - star icon for items without sprite
  return (
    <div
      className="rounded-pixel bg-parchment-700 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="text-parchment-300">⭐</span>
    </div>
  );
};

export const ItemsDisplay: React.FC<ItemsDisplayProps> = ({ puzzle, className = '' }) => {
  const itemsWithSources = useMemo(() => getPuzzleItemsWithSources(puzzle), [puzzle]);

  // Don't render if no items
  if (itemsWithSources.length === 0) {
    return null;
  }

  return (
    <div className={`dungeon-panel p-2 lg:p-3 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HelpButton sectionId="items" />
          <h3 className="text-lg lg:text-xl font-bold text-parchment-400">Items</h3>
        </div>
        <span className="text-sm lg:text-base text-stone-400">
          {itemsWithSources.length} type{itemsWithSources.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {itemsWithSources.map(({ collectible, onMap, dropSources }) => (
          <div
            key={collectible.id}
            className="p-2 bg-stone-800/80 rounded-pixel-md border border-parchment-900/30"
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0">
                <ItemIcon collectible={collectible} size={24} />
              </div>

              {/* Name and effects */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm lg:text-base font-medium text-parchment-200">
                    {collectible.name}
                  </span>
                  {/* On map indicator */}
                  {onMap && (
                    <span className="dungeon-badge">
                      On Map
                    </span>
                  )}
                </div>

                {/* Description if available */}
                {collectible.description && (
                  <div
                    className="text-xs lg:text-sm text-stone-400 mt-0.5"
                    dangerouslySetInnerHTML={{ __html: collectible.description }}
                  />
                )}
                {/* Show placement restriction info - separate line like SpecialTilesDisplay */}
                {collectible.preventPlacement && (
                  <div className="text-xs lg:text-sm text-blood-400/70 mt-0.5">
                    Cannot place heroes on this tile
                  </div>
                )}
              </div>
            </div>

            {/* Drop sources - who drops this item */}
            {dropSources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-stone-700">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-stone-500 mr-1">Dropped by:</span>
                  {dropSources.map((source) => (
                    <div
                      key={source.id}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-pixel text-xs ${
                        source.isEnemy
                          ? 'bg-blood-900/50 text-blood-300 border border-blood-700'
                          : 'bg-copper-900/50 text-copper-300 border border-copper-700'
                      }`}
                      title={source.name}
                    >
                      {source.sprite && (
                        <SpriteThumbnail sprite={source.sprite} size={16} previewType="entity" />
                      )}
                      <span className="max-w-[60px] truncate">{source.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
