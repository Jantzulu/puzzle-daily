import React, { useMemo } from 'react';
import type { Puzzle, CharacterAction, StatusEffectAsset } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { loadSpellAsset, loadStatusEffectAsset } from '../../utils/assetStorage';

interface StatusEffectsDisplayProps {
  puzzle: Puzzle;
}

/**
 * Extracts all possible status effects that could appear in a puzzle
 * by examining the spells used by available characters and enemies
 */
function getPuzzleStatusEffects(puzzle: Puzzle): StatusEffectAsset[] {
  const statusEffectIds = new Set<string>();

  // Helper to extract status effects from an array of actions
  const extractFromActions = (actions: CharacterAction[] | undefined) => {
    if (!actions) return;

    for (const action of actions) {
      if (action.spellId) {
        const spell = loadSpellAsset(action.spellId);
        if (spell?.appliesStatusEffect?.statusAssetId) {
          statusEffectIds.add(spell.appliesStatusEffect.statusAssetId);
        }
      }
    }
  };

  // Check all available characters
  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character) {
      extractFromActions(character.behavior);
    }
  }

  // Check all enemies
  for (const placedEnemy of puzzle.enemies) {
    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy?.behavior?.pattern) {
      extractFromActions(enemy.behavior.pattern);
    }
  }

  // Load and return unique status effect assets
  const effects: StatusEffectAsset[] = [];
  for (const effectId of statusEffectIds) {
    const effect = loadStatusEffectAsset(effectId);
    if (effect) {
      effects.push(effect);
    }
  }

  return effects;
}

/**
 * Renders a status effect icon based on its sprite data
 */
const StatusEffectIcon: React.FC<{ effect: StatusEffectAsset; size?: number }> = ({ effect, size = 24 }) => {
  const iconSprite = effect.iconSprite;

  // Handle inline sprite (simple shapes)
  if (iconSprite.type === 'inline' && iconSprite.spriteData) {
    const { shape, primaryColor } = iconSprite.spriteData;

    // Render simple shape
    switch (shape) {
      case 'circle':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill={primaryColor} />
          </svg>
        );
      case 'square':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24">
            <rect x="2" y="2" width="20" height="20" rx="2" fill={primaryColor} />
          </svg>
        );
      case 'diamond':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24">
            <polygon points="12,2 22,12 12,22 2,12" fill={primaryColor} />
          </svg>
        );
      case 'triangle':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24">
            <polygon points="12,2 22,22 2,22" fill={primaryColor} />
          </svg>
        );
      case 'star':
        return (
          <svg width={size} height={size} viewBox="0 0 24 24">
            <polygon
              points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9"
              fill={primaryColor}
            />
          </svg>
        );
      default:
        // Default circle
        return (
          <svg width={size} height={size} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill={primaryColor || '#888'} />
          </svg>
        );
    }
  }

  // Handle stored sprite (image data)
  if (iconSprite.type === 'stored' && iconSprite.spriteId) {
    // For stored sprites, we'd need to load the sprite data
    // For now, show a placeholder
    return (
      <div
        className="rounded bg-gray-600 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-xs">?</span>
      </div>
    );
  }

  // Fallback
  return (
    <div
      className="rounded bg-gray-600"
      style={{ width: size, height: size }}
    />
  );
};

export const StatusEffectsDisplay: React.FC<StatusEffectsDisplayProps> = ({ puzzle }) => {
  const statusEffects = useMemo(() => getPuzzleStatusEffects(puzzle), [puzzle]);

  // Don't render if no status effects
  if (statusEffects.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 p-4 rounded">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Status Effects</h3>
        <span className="text-sm text-gray-400">
          {statusEffects.length} possible
        </span>
      </div>

      <div className="space-y-2">
        {statusEffects.map((effect) => (
          <div
            key={effect.id}
            className="flex items-start gap-3 p-2 bg-gray-700 rounded"
          >
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
        ))}
      </div>
    </div>
  );
};
