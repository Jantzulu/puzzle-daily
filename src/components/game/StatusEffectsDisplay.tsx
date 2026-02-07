import React, { useMemo } from 'react';
import type { Puzzle, CharacterAction, StatusEffectAsset } from '../../types/game';
import { getCharacter, type CharacterWithSprite } from '../../data/characters';
import { getEnemy, type EnemyWithSprite } from '../../data/enemies';
import { loadSpellAsset, loadStatusEffectAsset, loadCollectible, type CustomSprite } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { HelpButton } from './HelpOverlay';

interface StatusEffectsDisplayProps {
  puzzle: Puzzle;
  className?: string;
  noPanel?: boolean; // If true, renders without the dungeon-panel wrapper
}

// Source type for status effects
type SourceType = 'character' | 'enemy' | 'item';

// Entity source info for a status effect
interface EntitySource {
  id: string;
  name: string;
  sprite?: CustomSprite;
  sourceType: SourceType;
}

// Status effect with source entities
interface StatusEffectWithSources {
  effect: StatusEffectAsset;
  sources: EntitySource[];
}

/**
 * Extracts all possible status effects that could appear in a puzzle
 * along with which entities/items can apply them
 */
function getPuzzleStatusEffectsWithSources(puzzle: Puzzle): StatusEffectWithSources[] {
  // Map from status effect ID to sources
  const effectSources = new Map<string, EntitySource[]>();

  // Helper to add a source for an effect
  const addEffectSource = (effectId: string, source: EntitySource) => {
    if (!effectSources.has(effectId)) {
      effectSources.set(effectId, []);
    }
    const sources = effectSources.get(effectId)!;
    if (!sources.some(s => s.id === source.id && s.sourceType === source.sourceType)) {
      sources.push(source);
    }
  };

  // Helper to extract status effects from an array of actions
  const extractFromActions = (actions: CharacterAction[] | undefined, source: EntitySource) => {
    if (!actions) return;

    for (const action of actions) {
      if (action.spellId) {
        const spell = loadSpellAsset(action.spellId);
        if (spell?.appliesStatusEffect?.statusAssetId) {
          addEffectSource(spell.appliesStatusEffect.statusAssetId, source);
        }
      }
    }
  };

  // Check all available characters
  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character) {
      extractFromActions(character.behavior, {
        id: charId,
        name: character.name,
        sprite: (character as CharacterWithSprite).customSprite,
        sourceType: 'character',
      });
    }
  }

  // Check all enemies (get unique enemy IDs)
  const seenEnemyIds = new Set<string>();
  for (const placedEnemy of puzzle.enemies) {
    if (seenEnemyIds.has(placedEnemy.enemyId)) continue;
    seenEnemyIds.add(placedEnemy.enemyId);

    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy?.behavior?.pattern) {
      extractFromActions(enemy.behavior.pattern, {
        id: placedEnemy.enemyId,
        name: enemy.name,
        sprite: (enemy as EnemyWithSprite).customSprite,
        sourceType: 'enemy',
      });
    }
  }

  // Check collectibles on the map for status effect applications
  const seenCollectibleIds = new Set<string>();
  for (const placed of puzzle.collectibles) {
    if (placed.collectibleId && !seenCollectibleIds.has(placed.collectibleId)) {
      seenCollectibleIds.add(placed.collectibleId);
      const collectible = loadCollectible(placed.collectibleId);
      if (collectible) {
        for (const effect of collectible.effects) {
          if (effect.type === 'status_effect' && effect.statusAssetId) {
            addEffectSource(effect.statusAssetId, {
              id: collectible.id,
              name: collectible.name,
              sprite: collectible.customSprite,
              sourceType: 'item',
            });
          }
        }
      }
    }
  }

  // Check death drops from characters and enemies for status effect applications
  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character?.droppedCollectibleId && !seenCollectibleIds.has(character.droppedCollectibleId)) {
      seenCollectibleIds.add(character.droppedCollectibleId);
      const collectible = loadCollectible(character.droppedCollectibleId);
      if (collectible) {
        for (const effect of collectible.effects) {
          if (effect.type === 'status_effect' && effect.statusAssetId) {
            addEffectSource(effect.statusAssetId, {
              id: collectible.id,
              name: collectible.name,
              sprite: collectible.customSprite,
              sourceType: 'item',
            });
          }
        }
      }
    }
  }

  for (const placedEnemy of puzzle.enemies) {
    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy?.droppedCollectibleId && !seenCollectibleIds.has(enemy.droppedCollectibleId)) {
      seenCollectibleIds.add(enemy.droppedCollectibleId);
      const collectible = loadCollectible(enemy.droppedCollectibleId);
      if (collectible) {
        for (const effect of collectible.effects) {
          if (effect.type === 'status_effect' && effect.statusAssetId) {
            addEffectSource(effect.statusAssetId, {
              id: collectible.id,
              name: collectible.name,
              sprite: collectible.customSprite,
              sourceType: 'item',
            });
          }
        }
      }
    }
  }

  // Build result array
  const results: StatusEffectWithSources[] = [];
  for (const [effectId, sources] of effectSources) {
    const effect = loadStatusEffectAsset(effectId);
    if (effect) {
      results.push({ effect, sources });
    }
  }

  return results;
}

/**
 * Renders a status effect icon based on its sprite data
 * Uses SpriteThumbnail for full sprite support including images and animations
 */
const StatusEffectIcon: React.FC<{ effect: StatusEffectAsset; size?: number }> = ({ effect, size = 24 }) => {
  const iconSprite = effect.iconSprite;

  // Handle inline sprite - use SpriteThumbnail for full rendering support
  if (iconSprite.type === 'inline' && iconSprite.spriteData) {
    const spriteData = iconSprite.spriteData as CustomSprite;
    return <SpriteThumbnail sprite={spriteData} size={size} previewType="asset" />;
  }

  // Handle stored sprite (would need to load from storage)
  if (iconSprite.type === 'stored' && iconSprite.spriteId) {
    return (
      <div
        className="rounded-pixel bg-mystic-800 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-mystic-400">?</span>
      </div>
    );
  }

  // Fallback - mystic placeholder
  return (
    <div
      className="rounded-pixel bg-mystic-800"
      style={{ width: size, height: size }}
    />
  );
};

export const StatusEffectsDisplay: React.FC<StatusEffectsDisplayProps> = ({ puzzle, className = '', noPanel = false }) => {
  const statusEffectsWithSources = useMemo(() => getPuzzleStatusEffectsWithSources(puzzle), [puzzle]);

  // Don't render if no status effects
  if (statusEffectsWithSources.length === 0) {
    return null;
  }

  // Accent divider for noPanel mode (when part of unified panel)
  const divider = noPanel ? (
    <div className="my-3 border-t border-copper-700/50 relative">
      <div className="absolute left-1/2 -translate-x-1/2 -top-px w-16 h-px bg-gradient-to-r from-transparent via-copper-500 to-transparent" />
    </div>
  ) : null;

  const content = (
    <>
      {divider}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HelpButton sectionId="status_effects" />
          <h3 className="text-lg lg:text-xl font-bold text-mystic-400">Enchantments</h3>
        </div>
        <span className="text-sm lg:text-base text-stone-400">
          {statusEffectsWithSources.length} possible
        </span>
      </div>

      <div className="space-y-2">
        {statusEffectsWithSources.map(({ effect, sources }) => (
          <div
            key={effect.id}
            className="p-2 bg-stone-800/80 rounded-pixel-md border border-mystic-900/30"
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0">
                <StatusEffectIcon effect={effect} size={24} />
              </div>

              {/* Name and description */}
              <div className="flex-1 min-w-0">
                <div className="text-sm lg:text-base font-medium text-mystic-300">
                  {effect.name}
                </div>
                <div className="text-xs lg:text-sm text-stone-400">
                  {effect.description}
                </div>
              </div>
            </div>

            {/* Entity sources - who can apply this effect */}
            {sources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-stone-700">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-stone-500 mr-1">Applied by:</span>
                  {sources.map((source) => {
                    const colorClass = source.sourceType === 'enemy'
                      ? 'bg-blood-900/50 text-blood-300 border border-blood-700'
                      : source.sourceType === 'item'
                      ? 'bg-parchment-900/50 text-parchment-300 border border-parchment-700'
                      : 'bg-copper-900/50 text-copper-300 border border-copper-700';

                    return (
                      <div
                        key={`${source.sourceType}-${source.id}`}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-pixel text-xs ${colorClass}`}
                        title={source.name}
                      >
                        {source.sprite && (
                          <SpriteThumbnail sprite={source.sprite} size={16} previewType="entity" />
                        )}
                        <span className="max-w-[60px] truncate">{source.name}</span>
                      </div>
                    );
                  })}
                </div>
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
