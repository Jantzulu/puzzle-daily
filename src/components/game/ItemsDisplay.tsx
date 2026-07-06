import React, { useMemo } from 'react';
import type { Puzzle } from '../../types/game';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import { getCharacter, type CharacterWithSprite } from '../../data/characters';
import { getEnemy, type EnemyWithSprite } from '../../data/enemies';
import { loadCollectible, loadSpellAsset, type CustomSprite, type CustomCollectible } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { HelpButton } from './HelpOverlay';

interface ItemsDisplayProps {
  puzzle: Puzzle;
  className?: string;
  noPanel?: boolean; // If true, renders without the dungeon-panel wrapper
}

// Entity source info for an item drop
interface EntitySource {
  id: string;
  name: string;
  sprite?: CustomSprite;
  isEnemy: boolean;
}

// Spell source info for throw/place items
interface SpellSource {
  spellName: string;
  entityId: string;
  entityName: string;
  entitySprite?: CustomSprite;
  isEnemy: boolean;
  isThrow: boolean; // true = thrown (range 2+), false = placed (range 0-1)
  duration?: number; // override duration from spell
}

// Item with optional drop sources
interface ItemWithSources {
  collectible: CustomCollectible;
  onMap: boolean;
  dropSources: EntitySource[];
  spellSources: SpellSource[];
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
            spellSources: [],
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
            spellSources: [],
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
            spellSources: [],
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

  // Check characters and enemies for Throw/Place spell sources
  const scanEntitySpells = (entityId: string, entityName: string, entitySprite: CustomSprite | undefined, isEnemy: boolean) => {
    const entity = isEnemy ? getEnemy(entityId) : getCharacter(entityId);
    if (!entity || !Array.isArray(entity.behavior)) return;

    const seenSpellIds = new Set<string>();
    for (const action of entity.behavior) {
      if (action.type !== 'spell' || !action.spellId) continue;
      if (seenSpellIds.has(action.spellId)) continue;
      seenSpellIds.add(action.spellId);

      const spell = loadSpellAsset(action.spellId);
      if (!spell || spell.templateType !== 'throw_place' || !spell.spawnCollectibleId) continue;

      const collectible = loadCollectible(spell.spawnCollectibleId);
      if (!collectible) continue;

      if (!itemMap.has(collectible.id)) {
        itemMap.set(collectible.id, {
          collectible,
          onMap: false,
          dropSources: [],
          spellSources: [],
        });
      }
      const item = itemMap.get(collectible.id)!;
      if (!item.spellSources.some(s => s.entityId === entityId && s.spellName === spell.name)) {
        item.spellSources.push({
          spellName: spell.name,
          entityId,
          entityName,
          entitySprite: entitySprite,
          isEnemy,
          isThrow: (spell.range ?? 0) >= 2,
          duration: spell.throwPlaceDuration,
        });
      }
    }
  };

  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character) {
      scanEntitySpells(charId, character.name, (character as CharacterWithSprite).customSprite, false);
    }
  }

  const seenEnemyIds2 = new Set<string>();
  for (const placedEnemy of puzzle.enemies) {
    if (seenEnemyIds2.has(placedEnemy.enemyId)) continue;
    seenEnemyIds2.add(placedEnemy.enemyId);
    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy) {
      scanEntitySpells(placedEnemy.enemyId, enemy.name, (enemy as EnemyWithSprite).customSprite, true);
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

export const ItemsDisplay: React.FC<ItemsDisplayProps> = ({ puzzle, className = '', noPanel = false }) => {
  const itemsWithSources = useMemo(() => getPuzzleItemsWithSources(puzzle), [puzzle]);

  // Don't render if no items
  if (itemsWithSources.length === 0) {
    return null;
  }

  // Chiseled seam between the dungeon's informational sections
  const divider = noPanel ? <div className="dungeon-seam" /> : null;

  const content = (
    <>
      {divider}
      <div className="relative flex items-center justify-between mb-1">
        <div className="min-w-[60px]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
          <div className="absolute right-full mr-1">
            <HelpButton sectionId="items" />
          </div>
          <h3 className="carved-header carved-header-parchment font-medieval text-lg lg:text-xl">Items</h3>
        </div>
        <span className="text-sm lg:text-base text-stone-400">
          {itemsWithSources.length} type{itemsWithSources.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Ledger rows, two columns when the width is there */}
      <div className="md:columns-2 md:gap-x-5">
        {itemsWithSources.map(({ collectible, onMap, dropSources, spellSources }) => (
          <div
            key={collectible.id}
            className="py-1.5 break-inside-avoid"
          >
            <div className="flex items-start gap-2">
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                <ItemIcon collectible={collectible} size={20} />
              </div>

              {/* Name and effects */}
              <div className="flex-1 min-w-0 leading-snug">
                <span className="text-sm lg:text-base font-medium text-parchment-200 mr-2">
                  {collectible.name}
                </span>
                {/* On map indicator */}
                {onMap && (
                  <span className="dungeon-badge align-middle">
                    On Map
                  </span>
                )}

                {/* Description if available */}
                {collectible.description && (
                  <div
                    className="text-xs lg:text-sm text-stone-400"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(collectible.description) }}
                  />
                )}
                {/* Show placement restriction info - separate line like SpecialTilesDisplay */}
                {collectible.preventPlacement && (
                  <div className="text-xs lg:text-sm text-blood-400/70">
                    Cannot place heroes on this tile
                  </div>
                )}
              </div>
            </div>

            {/* Drop sources - who drops this item */}
            {dropSources.length > 0 && (
              <div className="mt-1 pl-7">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-stone-500 mr-1">Dropped by:</span>
                  {dropSources.map((source) => (
                    <div
                      key={source.id}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-pixel text-xs ${
                        source.isEnemy
                          ? 'bg-blood-900/50 text-blood-300 border border-blood-700'
                          : 'bg-arcane-900/50 text-arcane-300 border border-arcane-700'
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

            {/* Spell sources - who places/throws this item */}
            {spellSources.length > 0 && (
              <div className="mt-1 pl-7">
                <div className="flex items-center gap-1 flex-wrap">
                  {spellSources.map((source, idx) => (
                    <div
                      key={`${source.entityId}-${source.spellName}-${idx}`}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-pixel text-xs ${
                        source.isEnemy
                          ? 'bg-blood-900/50 text-blood-300 border border-blood-700'
                          : 'bg-arcane-900/50 text-arcane-300 border border-arcane-700'
                      }`}
                      title={`${source.isThrow ? 'Thrown' : 'Placed'} by ${source.entityName}`}
                    >
                      {source.entitySprite && (
                        <SpriteThumbnail sprite={source.entitySprite} size={16} previewType="entity" />
                      )}
                      <span className="max-w-[80px] truncate">
                        {source.isThrow ? 'Thrown' : 'Placed'} by {source.entityName}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Duration info */}
                {spellSources.some(s => s.duration && s.duration > 0) && (
                  <div className="text-xs text-stone-400 mt-0.5">
                    {spellSources.filter(s => s.duration && s.duration > 0).map((s, i) => (
                      <span key={i}>
                        {i > 0 && ', '}Lasts {s.duration} turn{s.duration !== 1 ? 's' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Duration info for base collectible */}
            {collectible.duration && collectible.duration > 0 && spellSources.length === 0 && (
              <div className="pl-7">
                <span className="text-xs text-stone-400">
                  Lasts {collectible.duration} turn{collectible.duration !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        ))}
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
