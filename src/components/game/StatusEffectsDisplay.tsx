import React, { useMemo } from 'react';
import type { Puzzle, CharacterAction, StatusEffectAsset } from '../../types/game';
import { getCharacter, type CharacterWithSprite } from '../../data/characters';
import { getEnemy, type EnemyWithSprite } from '../../data/enemies';
import { loadSpellAsset, loadStatusEffectAsset, type CustomSprite } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';

interface StatusEffectsDisplayProps {
  puzzle: Puzzle;
}

// Entity source info for a status effect
interface EntitySource {
  id: string;
  name: string;
  sprite?: CustomSprite;
  isEnemy: boolean;
}

// Status effect with source entities
interface StatusEffectWithSources {
  effect: StatusEffectAsset;
  sources: EntitySource[];
}

/**
 * Extracts all possible status effects that could appear in a puzzle
 * along with which entities can apply them
 */
function getPuzzleStatusEffectsWithSources(puzzle: Puzzle): StatusEffectWithSources[] {
  // Map from status effect ID to sources
  const effectSources = new Map<string, EntitySource[]>();

  // Helper to extract status effects from an array of actions
  const extractFromActions = (actions: CharacterAction[] | undefined, source: EntitySource) => {
    if (!actions) return;

    for (const action of actions) {
      if (action.spellId) {
        const spell = loadSpellAsset(action.spellId);
        if (spell?.appliesStatusEffect?.statusAssetId) {
          const effectId = spell.appliesStatusEffect.statusAssetId;
          if (!effectSources.has(effectId)) {
            effectSources.set(effectId, []);
          }
          // Add source if not already present
          const sources = effectSources.get(effectId)!;
          if (!sources.some(s => s.id === source.id)) {
            sources.push(source);
          }
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
        isEnemy: false,
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
        isEnemy: true,
      });
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
    return <SpriteThumbnail sprite={spriteData} size={size} />;
  }

  // Handle stored sprite (would need to load from storage)
  if (iconSprite.type === 'stored' && iconSprite.spriteId) {
    return (
      <div
        className="rounded bg-gray-600 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-gray-400">?</span>
      </div>
    );
  }

  // Fallback - gray placeholder
  return (
    <div
      className="rounded bg-gray-600"
      style={{ width: size, height: size }}
    />
  );
};

export const StatusEffectsDisplay: React.FC<StatusEffectsDisplayProps> = ({ puzzle }) => {
  const statusEffectsWithSources = useMemo(() => getPuzzleStatusEffectsWithSources(puzzle), [puzzle]);

  // Don't render if no status effects
  if (statusEffectsWithSources.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 p-4 rounded">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Status Effects</h3>
        <span className="text-sm text-gray-400">
          {statusEffectsWithSources.length} possible
        </span>
      </div>

      <div className="space-y-2">
        {statusEffectsWithSources.map(({ effect, sources }) => (
          <div
            key={effect.id}
            className="p-2 bg-gray-700 rounded"
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0">
                <StatusEffectIcon effect={effect} size={24} />
              </div>

              {/* Name and description */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-200">
                  {effect.name}
                </div>
                <div className="text-xs text-gray-400">
                  {effect.description}
                </div>
              </div>
            </div>

            {/* Entity sources - who can apply this effect */}
            {sources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-600">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-gray-500 mr-1">Applied by:</span>
                  {sources.map((source) => (
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
