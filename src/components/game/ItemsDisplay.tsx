import React, { useMemo } from 'react';
import type { Puzzle } from '../../types/game';
import { getCharacter, type CharacterWithSprite } from '../../data/characters';
import { getEnemy, type EnemyWithSprite } from '../../data/enemies';
import { loadCollectible, loadStatusEffectAsset, type CustomSprite, type CustomCollectible } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';

interface ItemsDisplayProps {
  puzzle: Puzzle;
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
 * Get effect type badge color and label
 */
function getEffectBadge(type: string): { color: string; label: string } {
  switch (type) {
    case 'score':
      return { color: 'bg-yellow-900 text-yellow-300', label: 'Score' };
    case 'heal':
      return { color: 'bg-green-900 text-green-300', label: 'Heal' };
    case 'damage':
      return { color: 'bg-red-900 text-red-300', label: 'Damage' };
    case 'status_effect':
      return { color: 'bg-blue-900 text-blue-300', label: 'Buff' };
    case 'win_key':
      return { color: 'bg-purple-900 text-purple-300', label: 'Key' };
    default:
      return { color: 'bg-gray-700 text-gray-300', label: type };
  }
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
    return <SpriteThumbnail sprite={collectible.customSprite} size={size} />;
  }

  // Fallback - star icon for items without sprite
  return (
    <div
      className="rounded bg-yellow-700 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="text-yellow-300">⭐</span>
    </div>
  );
};

export const ItemsDisplay: React.FC<ItemsDisplayProps> = ({ puzzle }) => {
  const itemsWithSources = useMemo(() => getPuzzleItemsWithSources(puzzle), [puzzle]);

  // Don't render if no items
  if (itemsWithSources.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 p-4 rounded">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Items</h3>
        <span className="text-sm text-gray-400">
          {itemsWithSources.length} type{itemsWithSources.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {itemsWithSources.map(({ collectible, onMap, dropSources }) => (
          <div
            key={collectible.id}
            className="p-2 bg-gray-700 rounded"
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0">
                <ItemIcon collectible={collectible} size={24} />
              </div>

              {/* Name and effects */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">
                    {collectible.name}
                  </span>
                  {/* On map indicator */}
                  {onMap && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-600 text-gray-300">
                      On Map
                    </span>
                  )}
                </div>

                {/* Description if available */}
                {collectible.description && (
                  <div
                    className="text-xs text-gray-400 mt-0.5"
                    dangerouslySetInnerHTML={{ __html: collectible.description }}
                  />
                )}

                {/* Effect badges */}
                {collectible.effects.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {collectible.effects.map((effect, i) => {
                      const badge = getEffectBadge(effect.type);
                      let label = badge.label;

                      // Add value details
                      if (effect.type === 'score' && effect.scoreValue) {
                        label = `+${effect.scoreValue} pts`;
                      } else if (effect.type === 'heal' && effect.amount) {
                        label = `Heal ${effect.amount}`;
                      } else if (effect.type === 'damage' && effect.amount) {
                        label = `Dmg ${effect.amount}`;
                      } else if (effect.type === 'status_effect' && effect.statusAssetId) {
                        const statusEffect = loadStatusEffectAsset(effect.statusAssetId);
                        if (statusEffect) {
                          label = statusEffect.name;
                        }
                      }

                      return (
                        <span
                          key={i}
                          className={`text-xs px-1.5 py-0.5 rounded ${badge.color}`}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Pickup permissions */}
                {collectible.pickupPermissions && (
                  <div className="text-xs text-gray-500 mt-1">
                    Pickup: {[
                      collectible.pickupPermissions.characters && 'Characters',
                      collectible.pickupPermissions.enemies && 'Enemies',
                    ].filter(Boolean).join(', ') || 'None'}
                  </div>
                )}
              </div>
            </div>

            {/* Drop sources - who drops this item */}
            {dropSources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-600">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-gray-500 mr-1">Dropped by:</span>
                  {dropSources.map((source) => (
                    <div
                      key={source.id}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                        source.isEnemy
                          ? 'bg-red-900/50 text-red-300'
                          : 'bg-green-900/50 text-green-300'
                      }`}
                      title={source.name}
                    >
                      {source.sprite && (
                        <SpriteThumbnail sprite={source.sprite} size={16} />
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
