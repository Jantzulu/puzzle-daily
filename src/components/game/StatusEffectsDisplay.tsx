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

// How the status effect reaches an entity
type ApplicationMethod = 'innate' | 'spell' | 'pickup' | 'death_drop';

// Entity source info for a status effect
interface EntitySource {
  id: string;
  name: string;
  sprite?: CustomSprite;
  sourceType: 'character' | 'enemy' | 'item';
  method: ApplicationMethod;
  spellName?: string;        // method === 'spell'
  dropperName?: string;      // method === 'death_drop': entity whose death triggers drop
  dropperSprite?: CustomSprite;
  dropperType?: 'character' | 'enemy';
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

  // Helper to add a source — deduplicates by id + sourceType + method + spellName
  const addEffectSource = (effectId: string, source: EntitySource) => {
    if (!effectSources.has(effectId)) {
      effectSources.set(effectId, []);
    }
    const sources = effectSources.get(effectId)!;
    const isDupe = sources.some(
      s => s.id === source.id && s.sourceType === source.sourceType &&
           s.method === source.method && s.spellName === source.spellName
    );
    if (!isDupe) sources.push(source);
  };

  // Helper to extract spell-applied effects from a behavior action list
  const extractFromActions = (
    actions: CharacterAction[] | undefined,
    baseSource: Omit<EntitySource, 'method' | 'spellName'>
  ) => {
    if (!actions) return;
    for (const action of actions) {
      if (action.spellId) {
        const spell = loadSpellAsset(action.spellId);
        if (spell?.appliesStatusEffect?.statusAssetId) {
          addEffectSource(spell.appliesStatusEffect.statusAssetId, {
            ...baseSource,
            method: 'spell',
            spellName: spell.name,
          });
        }
      }
    }
  };

  // Check all available characters
  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character) {
      const base = {
        id: charId,
        name: character.name,
        sprite: (character as CharacterWithSprite).customSprite,
        sourceType: 'character' as const,
      };
      extractFromActions(character.behavior, base);
      for (const ise of character.initialStatusEffects ?? []) {
        addEffectSource(ise.statusAssetId, { ...base, method: 'innate' });
      }
    }
  }

  // Check all enemies (unique by enemyId)
  const seenEnemyIds = new Set<string>();
  for (const placedEnemy of puzzle.enemies) {
    if (seenEnemyIds.has(placedEnemy.enemyId)) continue;
    seenEnemyIds.add(placedEnemy.enemyId);

    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy) {
      const base = {
        id: placedEnemy.enemyId,
        name: enemy.name,
        sprite: (enemy as EnemyWithSprite).customSprite,
        sourceType: 'enemy' as const,
      };
      if (enemy.behavior?.pattern) extractFromActions(enemy.behavior.pattern, base);
      for (const ise of enemy.initialStatusEffects ?? []) {
        addEffectSource(ise.statusAssetId, { ...base, method: 'innate' });
      }
    }
  }

  // Check collectibles placed on the map
  const seenMapCollectibleIds = new Set<string>();
  for (const placed of puzzle.collectibles) {
    if (placed.collectibleId && !seenMapCollectibleIds.has(placed.collectibleId)) {
      seenMapCollectibleIds.add(placed.collectibleId);
      const collectible = loadCollectible(placed.collectibleId);
      if (collectible) {
        for (const effect of collectible.effects) {
          if (effect.type === 'status_effect' && effect.statusAssetId) {
            addEffectSource(effect.statusAssetId, {
              id: collectible.id,
              name: collectible.name,
              sprite: collectible.customSprite,
              sourceType: 'item',
              method: 'pickup',
            });
          }
        }
      }
    }
  }

  // Check death drops — attribute to the dropping entity, not the item
  const processDeathDrop = (
    collectibleId: string,
    dropperName: string,
    dropperSprite: CustomSprite | undefined,
    dropperType: 'character' | 'enemy'
  ) => {
    const collectible = loadCollectible(collectibleId);
    if (!collectible) return;
    for (const effect of collectible.effects) {
      if (effect.type === 'status_effect' && effect.statusAssetId) {
        addEffectSource(effect.statusAssetId, {
          id: `${dropperType}-drop-${collectibleId}`,
          name: collectible.name,
          sprite: collectible.customSprite,
          sourceType: 'item',
          method: 'death_drop',
          dropperName,
          dropperSprite,
          dropperType,
        });
      }
    }
  };

  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character?.droppedCollectibleId) {
      processDeathDrop(
        character.droppedCollectibleId,
        character.name,
        (character as CharacterWithSprite).customSprite,
        'character'
      );
    }
  }

  for (const placedEnemy of puzzle.enemies) {
    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy?.droppedCollectibleId) {
      processDeathDrop(
        enemy.droppedCollectibleId,
        enemy.name,
        (enemy as EnemyWithSprite).customSprite,
        'enemy'
      );
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

  // Chiseled seam between the dungeon's informational sections
  const divider = noPanel ? <div className="dungeon-seam" /> : null;

  const content = (
    <>
      {divider}
      <div className="relative flex items-center justify-between mb-1">
        <div className="min-w-[60px]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
          <div className="absolute right-full mr-1">
            <HelpButton sectionId="status_effects" />
          </div>
          <h3 className="carved-header carved-header-mystic font-medieval text-lg lg:text-xl">Status Effects</h3>
        </div>
        <span className="text-sm lg:text-base text-stone-400">
          {statusEffectsWithSources.length} possible
        </span>
      </div>

      {/* Ledger rows, two columns when the width is there — the entry
          boxes read as wasted air; a tight row per effect keeps every
          field (name, description, grouped sources) in less space */}
      <div className="md:columns-2 md:gap-x-5">
        {statusEffectsWithSources.map(({ effect, sources }) => (
          <div
            key={effect.id}
            className="py-1.5 border-t border-stone-700/40 first:border-t-0 break-inside-avoid"
          >
            <div className="flex items-start gap-2">
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                <StatusEffectIcon effect={effect} size={20} />
              </div>

              {/* Name and description flow inline */}
              <div className="flex-1 min-w-0 leading-snug">
                <span className="text-sm lg:text-base font-medium text-mystic-300">
                  {effect.name}
                </span>
                <span className="text-xs lg:text-sm text-stone-400"> — {effect.description}</span>
              </div>
            </div>

            {/* Source groups — grouped by application method */}
            {sources.length > 0 && (() => {
              const innate    = sources.filter(s => s.method === 'innate');
              const spells    = sources.filter(s => s.method === 'spell');
              const pickups   = sources.filter(s => s.method === 'pickup');
              const deathDrop = sources.filter(s => s.method === 'death_drop');

              const entityBadge = (source: EntitySource, key: string) => {
                const colorClass = source.sourceType === 'enemy'
                  ? 'bg-blood-900/50 text-blood-300 border border-blood-700'
                  : source.sourceType === 'item'
                  ? 'bg-parchment-900/50 text-parchment-300 border border-parchment-700'
                  : 'bg-copper-900/50 text-copper-300 border border-copper-700';
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-pixel text-xs ${colorClass}`}
                    title={source.name}
                  >
                    {source.sprite && (
                      <SpriteThumbnail sprite={source.sprite} size={16} previewType="entity" />
                    )}
                    <span className="max-w-[72px] truncate">{source.name}</span>
                  </div>
                );
              };

              const allPickups = [...pickups, ...deathDrop];

              return (
                <div className="mt-1 pl-7 space-y-0.5">
                  {/* Innate: entity starts with the effect */}
                  {innate.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-stone-500 mr-1">Starts with:</span>
                      {innate.map(s => entityBadge(s, `innate-${s.id}`))}
                    </div>
                  )}

                  {/* Spell/attack: show which unit applies it, not the spell name */}
                  {spells.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-stone-500 mr-1">Applied by:</span>
                      {spells.map(s => entityBadge(s, `spell-${s.id}`))}
                    </div>
                  )}

                  {/* Pickup: collecting an item grants it (includes death-drop items) */}
                  {allPickups.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-stone-500 mr-1">On pickup:</span>
                      {allPickups.map(s => entityBadge(s, `pickup-${s.id}`))}
                    </div>
                  )}
                </div>
              );
            })()}
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
